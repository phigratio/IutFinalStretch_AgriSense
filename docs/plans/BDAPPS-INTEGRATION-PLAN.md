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
Only the **masked `subscriberId`** returned by `otp/verify` is accepted. So:

> **OTP verification is the front door. Nothing in the REACH or PAYMENT layers works for a
> farmer until they've been OTP-verified once and we've stored their masked subscriberId.**

We already built this: `src/bdapps/subscriberStore.ts` captures the masked id at verify and
resolves every later call to it (`resolveSubscriberAddress`). This plan is largely about
routing every feature through that door.

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
