# BDApps Integration Plan — architecture + user story flows

> How every BDApps API maps onto AgriSense's real features (web + React Native),
> which are live today, and what to build next. Owner: Labib. Written 24 Jul ~18:15.
> Read alongside: DESIGN.md §7 (bdapps shapes), the live status in MEMORY.md §7.

---

## 1. The core idea — BDApps is three layers around the agent, not one feature

AgriSense's brain is the agent (intake → weather → RAG → crop rank → plan → finance).
BDApps does **not** live inside that brain. It wraps it in three distinct layers, each
answering a different question:

```
                    ┌─────────────────────────────────────────────┐
                    │                 AGENT CORE                    │
                    │  intake · weather · RAG · crop · plan · money  │
                    └─────────────────────────────────────────────┘
        ┌───────────────────────┬───────────────────────┬───────────────────────┐
        ▼                       ▼                       ▼
  ① IDENTITY layer        ② REACH layer            ③ PAYMENT layer
  "Who is this farmer      "How does advice get      "How does money move?"
   and how do we remember   to the farmer, even
   them everywhere?"        without the app?"
  ─────────────────────    ─────────────────────    ─────────────────────
  OTP request/verify       SMS send (outbound)      Subscription (recurring)
  → masked subscriberId    SMS receive (inbound)      = advisory Premium tier
  = the farmer's ID        USSD (offline menu)      CaaS direct debit (one-off)
  = key to cross-session                              = marketplace input buys
    memory (Tier 1)        + delivery reports         + balance = affordability
```

**Why this framing matters for the demo/judges:** it turns "we called some BDApps
endpoints" into "BDApps is the identity, reach, and payment fabric that lets an AI agent
actually serve a smallholder farmer who may not have a smartphone or data." That is the
story judges reward.

### The single most important technical fact (drives everything below)

For our app config (Subscriber Confirmation Required = YES), **BDApps rejects the raw phone
number on SMS / CaaS / subscription calls with E1951 — even after the farmer is REGISTERED.**
Only the **masked `subscriberId`** (privacy-preserving token) is accepted. BDApps only hands
us that token when the farmer takes a consent action through us — you cannot text a stranger.

> **A captured masked subscriberId is the prerequisite for ANY BDApps communication with a
> farmer. Without it, BDApps is inert for that user — no SMS, no alerts, no payment.**

### 1a. Login ≠ channel activation (the distinction that governs everything)

These are two different things and must not be conflated:

- **Login** = getting *into the app*. Any method works: email/password, Google (Navid's
  flows), or BDApps OTP. Login alone gives app access and a role token. **Login by
  email/Google yields NO masked id → those users are unreachable by BDApps.**
- **Channel activation** = capturing the farmer's **masked subscriberId** so BDApps can reach
  them. This is a *separate* consent step, required before any SMS/alert/payment feature works,
  and prompted when the farmer opts into such a feature ("Verify your phone to get weather
  alerts by SMS").

**The masked id is captured at three points (per DGD §6.3.2 + §3.2/§4.2), most reliable first:**

| # | Capture point | When | Reliability |
|---|---|---|---|
| 1 | **Subscription-notification webhook** `/bdapps/subscription` | After the farmer confirms subscription (telecom-side) | **Canonical** — DGD: masked-msisdn is delivered here on confirmation |
| 2 | **Inbound SMS / USSD** `sourceAddress` on `/bdapps/sms`,`/bdapps/ussd` | Farmer texts `agrisms START` to 21213 or dials `*213*74756#` | Reliable — user-initiated opt-in, no OTP needed |
| 3 | **OTP verify** response `subscriberId` | App-initiated OTP flow | **Optional** per DGD — only populated *after* subscription confirmation; treat as a bonus, not a guarantee |

Consequences the whole team must design around:
- A user who logs in with email/Google and never subscribes / texts in / verifies is
  **BDApps-unreachable** — by BDApps' privacy design, not our bug.
- **Navid's tenant-entered phone** (`FarmerOnboarding.phone`, `filledBy: tenant`) is a raw
  number → **not a reachable channel**. The farmer still must activate the channel themselves.
- Fallbacks for the unreachable (in-app notification — needs app open; email — non-BDApps)
  exist but are not real substitutes for SMS reach.

**The rule:** *Login is for app access. A captured masked subscriberId (webhook > inbound >
OTP) is the prerequisite for BDApps communication. Any feature that reaches the farmer
off-app must ensure the channel is active, and prompt channel activation if it isn't.*

We already built the credential cache: `src/bdapps/subscriberStore.ts` (maps number → masked
id, resolves every call). The work ahead wires the three capture points into it + persists to
`FarmerProfile.bdappsSubscriberId`, then gates features on "is the channel active?".

---

## 2. API → feature → rubric map (the whole surface at a glance)

| BDApps API | Layer | AgriSense feature it powers | Rubric tie-in | Status |
|---|---|---|---|---|
| **OTP request/verify** | ① Identity | Phone login; ties farm profile + memory to one identity across app/SMS/USSD | Memory (Tier 1), Agentic | ✅ works (new numbers) |
| **Subscription subscribe/status** | ③ Payment | "AgriSense Premium" advisory tier (proactive alerts, scenario sim, marketplace) — recurring monetization | bdapps CaaS row, Innovation | ✅ works (REGISTERED, real ৳ charge) |
| **SMS send (outbound)** | ② Reach | Proactive weather alerts, plan-task reminders, payment receipts, "advising through harvest" | Agentic (proactive), Tier 1 | ✅ works (via masked id) |
| **SMS receive (inbound)** | ② Reach | Keyword commands for no-app farmers: `agrisms PLAN / WEATHER / PRICE rice` | Innovation, accessibility | ⚙ listener exists, needs wiring |
| **USSD send/receive** | ② Reach | Offline menu on any phone: `*213*74756#` → advice/weather/price/plan | Innovation, low-literacy (Tier 2) | ⚙ listener exists, needs menu logic |
| **CaaS direct debit** | ③ Payment | Marketplace one-off input purchase (buy urea from ranked supplier) | bdapps CaaS row (10 pts) | ❌ blocked bdapps-side (E1371) — code ready |
| **CaaS balance/list-pi** | ③ Payment | Affordability check before recommending inputs; show payment options | bdapps CaaS row | ❌ blocked (404) — pre-checks now skippable |
| **SMS delivery report** | ② Reach | Confirm alerts arrived; retry undelivered | Technical polish | ⚙ optional |

Legend: ✅ live · ⚙ partial/needs code · ❌ blocked on bdapps activation (our code is ready).

---

## 3. User story flows (the heart of this plan)

Each flow shows the farmer's experience and the exact API calls, in order. `→` = our
backend calls BDApps; `⇐` = BDApps calls our listener.

### Flow A — Onboarding & identity (① OTP)  ·  *enables Tier-1 memory*

> **Story:** Rahim opens AgriSense for the first time. He enters his Robi number. He gets a
> code by SMS, types it in, and he's in — and every future session, on any channel, knows
> it's him.

1. App: farmer enters `01805758966` on the welcome screen.
2. `→ POST /subscription/otp/request` → BDApps SMS-es a 6-digit code, returns `referenceNo`.
   Backend stores `referenceNo → number` (subscriberStore).
3. Farmer types the code. `→ POST /subscription/otp/verify {referenceNo, otp}` → returns
   **masked `subscriberId`** + `subscriptionStatus`.
4. Backend: `rememberMaskedSubscriber(referenceNo, masked)`; upsert `FarmerProfile`
   (`bdappsMobile` = number, and store the masked id). **This masked id is now the farmer's
   durable identity.**
5. On any later app open / SMS / USSD, we look up the farmer by number → masked id → load
   their `FarmerProfile` + farms + last plan + mem0 conversation summary. **This is exactly
   the Tier-1 "remembers across sessions" behavior — powered by OTP identity.**

*Status:* OTP + store built and live. TODO: persist masked id on `FarmerProfile`, add the
welcome/login screen to app, greet returning farmer with plan status.

### Flow B — Go Premium (③ Subscription)  ·  *the working money path*

> **Story:** Rahim wants the agent to keep watching his crop and text him when to act. He
> taps "Get AgriSense Premium — ৳X/month". He confirms, gets a welcome SMS, and proactive
> alerts switch on.

1. App: farmer taps Subscribe on the Premium card.
2. `→ POST /subscription/send {subscriberId: masked, action: "1"}`.
3. BDApps sends the telecom confirmation, charges the subscription fee (we saw **Tk 1 + VAT**
   charged live), then `⇐ POST /bdapps/subscription` notifies our listener → we mark the
   farmer `premium` in `FarmerProfile` and flip on their alert schedule.
4. Free vs Premium gating:
   - **Free:** intake, one weather-grounded plan, marketplace browse.
   - **Premium:** proactive weather/plan-task SMS alerts, scenario simulation, marketplace
     purchase, unlimited replans.
5. `→ POST /subscription/getStatus` on app open confirms entitlement; `STOP agrisms` to 21213
   or in-app Unsubscribe → `action: "0"` → downgrade.

*Status:* subscribe/status/unsubscribe all live (REGISTERED). TODO: `premium` flag on
profile, the Premium card in app, listener → entitlement wiring, feature gating.

### Flow C — Proactive alert delivered by SMS (② SMS out)  ·  *biggest current gap*

> **Story:** It's 6am. Rahim's phone buzzes: "AgriSense: Heavy rain (34mm) expected Sun-Mon.
> Your urea top-dress was due Sat — apply by Fri morning or delay to Wed to cut runoff loss."
> He never opened the app.

1. Temporal `weatherAlertSweepWorkflow` runs on schedule (already built) → re-checks forecast
   per farm → rule fires → **writes a `proactive_alerts` row** (already built).
2. **NEW integration:** on alert creation, resolve the farm's farmer → `bdappsMobile` →
   masked id → `→ POST /sms/send {destinationAddresses: [masked], message, encoding}`
   (Bengali = encoding `16` when `preferredLanguage=bn`). Mark alert `delivered` + store the
   BDApps `messageId`.
3. `⇐` delivery report on `/bdapps/sms` → mark `confirmed`/`retry`.
4. In-app Alerts tab shows the same alerts with a "sent by SMS ✓" badge.

*This is the "tool use + multi-step + proactive" behavior judges score, made tangible: the
agent reaches the farmer off-app.* `planTaskReminderSweepWorkflow` uses the identical path
("Tomorrow: apply 45kg urea").

*Status:* alerts computed + stored today, **but never sent**. TODO: add an SMS-delivery
activity that runs after alert creation, gated on Premium + a captured masked id.

### Flow D — No-app farmer via inbound SMS (② SMS in)

> **Story:** Rahim's neighbour has a basic phone, no data. He texts `agrisms PLAN` to 21213
> and gets his plan status back as a text.

1. Neighbour texts `agrisms PLAN` (or `WEATHER`, `PRICE rice`) to shortcode 21213.
2. `⇐ POST /bdapps/sms {sourceAddress: masked, message}` → our listener parses the keyword.
3. Backend runs the matching read (plan status / weather tool / market price) for the farmer
   identified by `sourceAddress` (masked id).
4. `→ POST /sms/send` back with a compact answer.

*Status:* SMS listener route exists (`/bdapps/sms`, replies S1000). TODO: keyword parser +
map to existing tools; needs the listener URL exposed (ngrok) if demoed live.

### Flow E — Offline menu via USSD (② USSD)  ·  *Tier-2 low-literacy accessibility*

> **Story:** Rahim dials `*213*74756#` on any phone. A menu appears: 1) Today's advice
> 2) Weather 3) Prices 4) My plan. He presses 1 and reads today's action on-screen. No app,
> no internet, no literacy barrier beyond the menu.

1. Farmer dials `*213*74756#` → `⇐ POST /bdapps/ussd {ussdOperation: "mo-init", sessionId,
   sourceAddress: masked}`.
2. Listener replies `→ POST /ussd/send {ussdOperation: "mt-cont", message: "1.Advice\n
   2.Weather\n3.Prices\n4.My plan"}` (Bengali via encoding 16).
3. Farmer presses `1` → `⇐ mo-cont` → we look up their latest alert/plan action → `→ mt-fin`
   with the answer, closing the session.
4. `sessionId` ties the back-and-forth; the farmer is identified by `sourceAddress` (masked).

*Status:* USSD listener + `ussdMenu.ts` scaffold exist. TODO: build the menu state machine
mapping options → existing read tools.

### Flow F — Buy inputs from the marketplace (③ CaaS)  ·  *the 10-pt CaaS row*

> **Story:** After the plan, Rahim opens Marketplace, sees urea ranked by price/distance,
> picks the best supplier, taps "Buy 50kg — ৳X", confirms, and gets an order receipt by SMS.

1. Marketplace agent ranks suppliers (already built, seeded). Farmer taps Buy on the top offer.
2. *(optional, when live)* `→ POST /caas/balance/query {masked}` → show affordability;
   `→ POST /caas/list/pi {masked}` → show "Mobile Account".
3. `→ POST /caas/direct/debit {subscriberId: masked, amount, externalTrxId: AGS-…}` →
   charges the input cost. Persist `bdapps_payments`; log every step to the agent trace.
4. `→ POST /sms/send` receipt: "AgriSense receipt: Tk X for 50kg urea from <supplier>.
   TrxID …". Order marked paid.
5. Insufficient balance → friendly "top up / smaller order", nothing charged.

*Status:* full checkout coded, masked-id wired, pre-checks now skip if their routes 404, and
the flow reaches the real debit. **Blocked only by BDApps not activating CaaS for the app
(E1371 / 404).** The instant they enable it, this works with zero code change. Demo fallback:
`MOCK_BDAPPS=1` (declared) OR narrate "code + trace are real; charge is simulated pending
CaaS activation" while showing the real subscription charge + real SMS as proof.

---

## 4. Data model — what identity/entitlement needs (small additions)

Mostly present; the gaps:

- `FarmerProfile.bdappsMobile` ✅ exists · **add** `bdappsSubscriberId` (masked, cached) and
  `premium Boolean` + `premiumSince`.
- `ProactiveAlert` ✅ exists · **add** delivery fields: `smsMessageId`, `deliveredAt`,
  `deliveryStatus` (so Flow C is inspectable and retry-able).
- `BdappsPayment` ✅ exists (marketplace/CaaS receipts).
- Subscriber masked-id is currently in-memory (`subscriberStore`) + env-seed; **promote to
  `FarmerProfile.bdappsSubscriberId`** so it survives restarts and is the single source.

## 5. Build order (each independently demoable; gate Premium/CaaS behind flags)

| Phase | What | Depends on | Effort |
|---|---|---|---|
| **B1** | OTP login screen (app) + persist masked id on `FarmerProfile` + returning-farmer greeting | OTP (live) | S |
| **B2** | Proactive **alert → SMS delivery** activity + Alerts tab "sent ✓" (Flow C) | B1, SMS (live) | M — highest demo value |
| **B3** | Premium subscribe card + entitlement gating + `/bdapps/subscription` listener → flag (Flow B) | B1, subscription (live) | M |
| **B4** | Inbound **SMS keyword** parser (Flow D) — needs ngrok listener | B1, SMS listener | S |
| **B5** | **USSD menu** state machine (Flow E) — needs ngrok listener | B1, ussdMenu scaffold | M |
| **B6** | Marketplace **CaaS buy** button end-to-end (Flow F) | checkout (ready) + BDApps CaaS activation | S code / blocked externally |
| **B7** | Bengali encoding (16) across SMS/USSD; delivery-report handling | B2/B5 | S |

Recommended next: **B1 → B2** (OTP identity, then real proactive SMS alerts) — that lands the
"agent that reaches the farmer through harvest" story on top of everything already working,
and needs no BDApps activation we don't already have.

## 6. Honest status to carry into the demo/README (real vs blocked)

- **Real & live:** OTP verify → masked identity; SMS send (S1000, delivered); subscription
  (REGISTERED, real recurring charge). These are genuine BDApps money/reach/identity flows.
- **Coded, needs a listener URL (ngrok):** inbound SMS keywords, USSD menu.
- **Coded & correct, blocked only on BDApps enabling CaaS for APP_139258:** marketplace CaaS
  purchase (E1371 direct-debit, 404 balance/list-pi). Escalation open with bdapps support.
- **Demo posture:** lead with the working subscription charge + real SMS alert (both move real
  money / reach the phone), show the CaaS checkout reaching a real debit call in the trace, and
  declare the CaaS charge as pending activation or simulated — never presented as completed.

---

## 7. Implementation plan (concrete, non-breaking, grounded in current code)

### 7.0 Two design rules this plan obeys

1. **Additive to Navid's auth.** BDApps login = a new *provider* through the existing
   `AuthStore.upsertOAuthUser` + `AuthIdentity` table (Google is already one provider). Zero
   edits to signup/login/Google/onboarding. Farmer gets a normal `role:"user"` token.
2. **Channel activation is a capability, not a login.** The masked id is captured at three
   points (§1a) and persisted once; features check "channel active?" via one helper.

### 7.1 Data model (one migration, all additive — owner: coordinate with Mujahid)

```
FarmerProfile        + bdappsSubscriberId String?   // masked id, the reach credential
                     + channelActivatedAt DateTime?  // when captured
                     + premium            Boolean @default(false)
                     + premiumSince       DateTime?
ProactiveAlert       + smsMessageId       String?   // BDApps messageId of the sent alert
                     + deliveredAt        DateTime?
                     + deliveryStatus     String @default("pending") // pending|sent|delivered|failed
AuthIdentity         (no change — new rows use provider="bdapps", providerUserId=normalized phone)
```

`bdappsSubscriberId` on `FarmerProfile` makes `subscriberStore` the *write-through cache* of a
durable column (survives restarts, replaces the env-seed for real users).

### 7.2 Backend modules

| File (new unless noted) | Responsibility |
|---|---|
| `src/bdapps/channel.ts` | `activateChannel(farmerId, mobile, maskedId)`, `getChannel(farmerId)`, `isChannelActive(farmerId)`. Writes `FarmerProfile.bdappsSubscriberId` + updates `subscriberStore`. Single source of truth for "can we reach this farmer?". |
| `src/auth/bdappsAuth.ts` | `BdappsAuthService` mirroring `GoogleOAuthService`: `requestOtp(phone)`, `verifyOtp(ref, otp)` → `store.upsertOAuthUser({provider:"bdapps", providerUserId: normPhone, email: synthetic, name, emailVerified:true})` → `createResponse(user).accessToken`. On verify, if masked id present, `activateChannel(...)`. |
| `src/routes/auth.ts` (edit, +2 routes) | `POST /auth/bdapps/otp/request`, `POST /auth/bdapps/otp/verify` — next to `/auth/google`. Only *additions*. |
| `src/routes/bdappsListeners.ts` (edit) | **Wire the 3 capture points:** `/bdapps/subscription` → `activateChannel` from `note.subscriberId` (canonical) + set/clear `premium`; `/bdapps/sms` → if keyword `START`/opt-in, `activateChannel` from `sourceAddress`, then keyword router (Flow D); `/bdapps/ussd` → USSD menu state machine (Flow E). |
| `src/notifications/smsDispatcher.ts` | `deliverAlert(alertId)`: load alert → farm → farmer → `getChannel` → if active + premium, `bdapps.sendSms(masked, message, {encoding: bn?16:0})` → write `smsMessageId`/`deliveryStatus`. No channel → mark `skipped_no_channel`. |
| `src/temporal/activities.ts` (edit) | After `INSERT proactive_alerts`, call `deliverAlert(...)` for each new alert (Flow C). |
| `src/routes/channel.ts` | `GET /api/channel/status` (is my channel active/premium?), used by app to decide whether to prompt activation. |

### 7.3 Frontend / mobile

| Surface | Work |
|---|---|
| Mobile **new "Account" tab** (or fold into Home) | Phone-verify (OTP) flow → calls `/auth/bdapps/otp/*`; shows channel status + Premium toggle. |
| Mobile **Alerts tab** (new) | List `proactive_alerts` with "sent by SMS ✓" badge; pull-to-refresh. |
| Mobile **Money/Market** | Before a BDApps-reaching action, check `/api/channel/status`; if inactive, show "Verify your phone to enable SMS receipts/alerts" → OTP sheet. |
| Web (Navid's) | Optional: add BDApps phone-verify button on SignIn/Onboarding beside Google; reuse same endpoints. Coordinate so it doesn't clash with his role flow. |

### 7.4 Sequenced phases (each shippable + demoable on its own)

- **P1 — Channel core + capture (foundation).** `channel.ts` + data model migration + wire
  `/bdapps/subscription` webhook to `activateChannel` (canonical capture) + `GET
  /api/channel/status`. *Demo:* subscribe → webhook fires → farmer's channel goes active,
  visible in status. **No app UI needed to prove it.** Highest leverage; unblocks everything.
- **P2 — Proactive alert → SMS (biggest demo value).** `smsDispatcher` + hook into the
  Temporal alert activity + mobile Alerts tab. *Demo:* trigger weather sweep → real SMS on the
  phone → alert shows "sent ✓". Rides entirely on already-working SMS.
- **P3 — BDApps login provider + phone-verify UX.** `bdappsAuth.ts` + 2 auth routes + mobile
  verify sheet. *Demo:* log in by phone; returning farmer greeted with plan status (Tier-1).
- **P4 — Inbound opt-in + keyword replies (Flow D).** Wire `/bdapps/sms` capture + keyword
  router. Needs ngrok. *Demo:* text `agrisms PLAN` → get plan back, no app.
- **P5 — USSD menu (Flow E).** State machine in `ussdMenu.ts`. Needs ngrok. *Demo:*
  `*213*74756#` → menu → advice.
- **P6 — Premium gating (Flow B).** `premium` flag from subscription webhook gates alerts/
  scenario/marketplace. *Demo:* subscribe → premium features unlock.
- **P7 — Marketplace CaaS buy (Flow F).** Wire the Buy button to the (ready) checkout. Works
  when BDApps activates CaaS.

### 7.5 Non-breaking checklist (verify after each phase)

- `npm test` green (Navid's auth/onboarding tests must stay green — they exercise the shared
  store/token).
- Existing `/auth/*`, `/api/onboarding/*` untouched in behavior; new routes are strictly added.
- A farmer created via BDApps and one created via Navid's onboarding with the **same phone**
  resolve to **one `AppUser`** (agree phone as canonical link with Navid — the one coordination
  item). `upsertOAuthUser`'s email-match fallback + a phone lookup in `activateChannel` covers it.
- `MOCK_BDAPPS=1` still exercises every flow offline for CI/dev.

### 7.6 Recommended start

**P1 then P2.** P1 makes "channel activation" real and captures the credential the correct
(canonical, webhook) way; P2 turns that into the headline "agent texts the farmer real advice"
demo — both on BDApps capabilities already proven live, no CaaS activation required.

### 7.7 Refinements from teammate features (surveyed 24 Jul ~21:30)

Since the plan was written, the team shipped role-based dashboards, a **pest-risk engine**,
**scenario/pest Temporal workflows**, and phone fields across onboarding/tenant/assist forms.
Impact on this plan (backend P1–P3 already done — these guide the frontend + remaining phases):

- **R1 — Pest-risk & scenario are NEW proactive-alert sources.** `src/pest/pestRiskService.ts`
  inserts into `proactive_alerts` (and scenario workflows exist). P2's `smsDispatcher` already
  delivers *any* pending alert regardless of type, so **pest/disease and scenario alerts get SMS
  delivery for free** — a great feature ("we detected blast risk at your rice's vegetative stage,
  scout now"). **But those paths don't currently *trigger* delivery** (only the weather/plan
  Temporal sweeps + the dev route do). Fix: add a `dispatchAlertsSafely()` call after pest/
  scenario alert creation (coordinate with phigratio, or a small shared post-insert hook). Low
  effort, high demo value — makes P2 cover 4 alert types, not 2.
- **R2 — Web verify-phone integration point = `UserDashboard`** (the farmer's role home), which
  already shows their phone from `GET /api/onboarding/me` (`OnboardingProfile.phone`,
  `missingFields` includes `"phone"`). Web flow: dashboard "Verify phone / Enable SMS alerts"
  button → `/auth/bdapps/otp/request(phone)` → OTP modal → `/auth/bdapps/otp/verify` → channel
  active; show status. **The farmer never retypes their number — reuse the onboarding phone.**
- **R2a — `/api/channel/status` refinement:** currently takes `?mobile=`. For the authenticated
  web farmer, add an auth-derived variant (token → onboarding phone → status) so the dashboard
  needs no phone param. Keep the `?mobile=` form for the dev/mobile pre-login case.
- **R3 — Phone-as-canonical-link is now urgent, not optional.** Phone is collected in onboarding
  self-profile, assist requests, AND tenant requests. A farmer can arrive at an `AppUser` via
  email/Google + onboarding phone, then BDApps-verify the same phone. Before P3 hits the web,
  agree with Navid: on `verifyOtp`, if an `AppUser` already exists whose onboarding/farmer phone
  matches, **link to it** (set the bdapps `AuthIdentity` on the existing user) rather than
  minting a second user. (Backend hook: extend `bdappsAuth.verifyOtp` to look up an existing
  user by phone before `upsertOAuthUser`.)

**Net:** the P1–P7 structure holds. Add **R1** (pest/scenario alerts → SMS, a quick P2 extension)
and fold **R2/R2a/R3** into the web phase (next). Nothing in the plan needs to be rethought.
