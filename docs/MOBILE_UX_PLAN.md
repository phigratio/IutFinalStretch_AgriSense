# AgriSense Mobile — User-Experience Refinement Plan

> **Purpose:** make the Expo mobile app tell one coherent farmer story instead of exposing
> backend modules. This is a living plan — any session (human or AI) can pick up a phase.
>
> **Session bootstrap:** *"Read `docs/MOBILE_UX_PLAN.md`. Implement Phase &lt;N&gt; only, in `mobile/`,
> reusing the existing UI kit (`mobile/src/components/ui.tsx`), i18n `t()` (default Bangla), and the
> Terracotta & Sage theme. No emojis. Typecheck + `npx expo export --platform web` before finishing.
> Update the Change log at the bottom."*
>
> **Last updated:** 2026-07-25 · Owner: Labib (mobile)

---

## 1. North star

Deliver the arc the problem statement asks for, on a phone, for a jargon-averse smallholder:

> *"From an empty field to a costed, weather-aware season plan — and keep advising through harvest."*

**Persona (from PROBLEM_STATEMENT.md §3):** smallholder in Bangladesh, thinks in **bigha / acre / ৳ /
dates**, low patience for jargon, Bangla-first. Secondary persona = **the judge**, who must *verify*
a number came from a real call in seconds.

## 2. Design principles

1. **Every screen answers one farmer question in the farmer's words.** If a screen answers a
   *developer's* question ("is the backend up?", "does CaaS return S1000?"), it is not a farmer screen.
2. **Plumbing is contextual or hidden.** BDApps / CaaS / agent-trace are rails, not destinations.
   They surface *inside* a farmer action, or live in a clearly-labeled "How it works (demo)" corner.
3. **Judge-safe.** Nothing that scores rubric points is deleted — visible trace, CaaS flow, KB, and
   explainability all stay fully demonstrable, just reframed.
4. **Bangla-first, minimal, no emojis.** Reuse the kit + `t()`; signal with color + Feather icons.
5. **One session model.** Chat writes the shared session (`state/session.tsx`); every other screen
   reads it — a farmer never re-enters what the agent already knows.

## 3. Current-state audit

| Screen (route) | What it is today | Farmer reason | Verdict → action |
|---|---|---|---|
| Home (`index`) | "Backend connection" check | none | **Infra leak** → rebuild as **Today** dashboard |
| Chat (`chat`) | Agent conversation → plan | "advise me" | **Keep** = **Advisor** (core) |
| Plan (`plan`) | Dated calendar | "what to do, when" | **Keep** → fold into **My Season** |
| Market (`market`) | Prices + suppliers + buy | "sell / buy inputs" | **Keep**; make payment contextual |
| Pest (`pest`) | Leaf photo + risk | "my plant is sick" | **Keep** (reachable from Advisor + My Season) |
| Finance (`finance`) | Budget vs actuals | "am I profitable" | **Keep** → fold into **My Season** |
| Knowledge (`knowledge`) | Search hub KB | weak (agent already cites KB) | **Fold** into Advisor ("Ask") / Guides |
| **BDApps (`bdapps`)** | Raw SMS/OTP/**Direct Charge** console + JSON | **none** | **Infra leak** → split into rails; console → Demo |
| Payments (`money`) | Type amount → charge | weak | **Infra leak** → contextual checkout + receipts |
| Trace (`trace`) | Every tool call as chips | none (judge) | **Judge-only** → inline + Demo/Transparency |
| Account (`account`) | Phone sign-in + SMS channel | "save farm / get alerts" | **Keep** → grows into **Me** |

**Missing farmer surfaces:** a **Today** home, an **Alerts/Advice inbox** (the "keeps advising"
pillar — currently invisible on mobile despite backend support), a guided **first-run onboarding**,
and **contextual checkout**.

## 4. Target information architecture (5 tabs + folds)

| Tab | Replaces | Farmer question | Folds in |
|---|---|---|---|
| **Today** | Home | "Where am I, what's next, any warnings?" | season-day + next task + **active alerts** + weather + "continue" |
| **Advisor** | Chat | "advise me / diagnose this leaf / ask" | leaf camera, **KB answers**, scenario "what if" entry |
| **My Season** | Plan (+Finance) | "my crop, calendar, money, what-ifs" | plan + finance + fertilizer schedule + scenario compare |
| **Market** | Market | "buy inputs / sell my crop" | supplier compare + **pay with mobile balance** (CaaS) + price intel |
| **Me** | Account (+More) | "my farm, alerts, language, help" | sign-in, **"Get advice by SMS"** toggle, receipts, language/theme, **How it works (demo)** |

### The BDApps rails (this is the key fix)

BDApps is **not a feature** — it is three invisible rails behind farmer actions:

| BDApps capability | Farmer-facing home | Wording the farmer sees |
|---|---|---|
| OTP request/verify | **Me → Sign in** | "Enter the code we texted you" |
| `subscribe` / channel | **Me → toggle** | "Get advice by SMS" |
| CaaS `direct/debit` | **Market → checkout** | "Pay ৳X from your mobile balance" |
| Raw SMS/OTP/USSD/charge console | **Me → How it works (demo)** | (labeled "Sandbox — for the demo") |

## 5. Detailed screen specs

> Reuse kit: `Screen, Card, Button, Chip, Field, TextField, StatTile, StatGrid, SectionHeader,
> EmptyState, Divider, LanguageToggle, ThemeToggle`. All static text via `t()`.

### 5.1 Today (`app/index.tsx`, rebuilt)
- **Purpose:** the farmer's home base for the season.
- **Shows:** greeting + farm chip; **Season status card** (crop, "day N of ~145, <stage>"), **Next
  task card** (from the plan's next dated item), **Active alerts** (top 1–2, tap → Alerts), **Weather
  strip** (today rain/temp), primary CTA "Continue with the advisor".
- **States:** *no session* → onboarding CTA ("Tell us about your farm"); *has session, no plan* →
  "Finish your plan" CTA; *has plan* → the cards above.
- **Endpoints:** derives from the shared session (`seasonPlan`, `weather`); alerts via
  `GET /api/temporal/alerts?farmId=`.
- **Done when:** a farmer opening the app sees where they are and what's next — zero dev language.

### 5.2 Advisor (`app/chat.tsx`, evolve)
- **Purpose:** the conversation + quick tools.
- **Shows:** chat (already refined: friendly field chips, collapsed trace, localized); a compact
  action row above the composer — **Ask** (KB question), **Diagnose leaf** (camera), **What if…**
  (scenario). KB results render as grounded answer cards with citations *inside* the chat.
- **Endpoints:** `/api/agrisense/message`, `/api/vision/diagnose`, `/api/kb/search`, scenario sim.
- **Done when:** "ask", "diagnose", and "what if" are one tap from the conversation; the standalone
  Knowledge tab is gone (folded here) or demoted to a "Guides" browse.

### 5.3 My Season (`app/plan.tsx` → hub)
- **Purpose:** everything about the chosen crop's season.
- **Shows (sections in one scroll or sub-tabs):** **Calendar** (dated tasks, status chips), **Money**
  (cost/revenue/net/ROI/break-even + budget vs actual — folds current Finance), **Fertilizer &
  irrigation** schedule (stage doses, organic option, rain-aware), **What if** (scenario compare, old
  vs new numbers).
- **Endpoints:** session `seasonPlan`, `/api/finance/summary`, scenario sim.
- **Done when:** the farmer sees the plan, the money, and can run a "what if" without leaving.

### 5.4 Market (`app/market.tsx`, evolve)
- **Purpose:** buy inputs and decide on selling.
- **Shows:** **Buy inputs** (supplier compare → cart → **"Pay ৳X from your mobile balance"** →
  receipt + SMS), **Sell / store / wait** price intel with reasoning.
- **Endpoints:** `/api/marketplace/*`, `/api/payments` (checkout).
- **Done when:** payment appears only in context ("pay for these 2 sacks"), never as a bare console;
  a receipt + confirmation SMS follow.

### 5.5 Me (`app/account.tsx` + `more.tsx` → merge)
- **Purpose:** identity, reach, settings, and the judge/demo corner.
- **Shows:** **Sign in with your phone** (OTP), **"Get advice by SMS"** toggle (channel/subscribe),
  **Receipts** (past payments), **Language / Theme**, **Help**, and a clearly separated
  **"How it works (demo)"** → agent Trace + BDApps sandbox console + connection check.
- **Endpoints:** `/auth/bdapps/otp/*`, `/api/channel/status`, `/api/payments` (receipts), `/api/bdapps/*`.
- **Done when:** the raw console + trace are reachable for judges but never in the farmer's main path.

### 5.6 Alerts inbox (new, `app/alerts.tsx`)
- **Purpose:** the "keeps advising through harvest" pillar.
- **Shows:** list of proactive alerts (weather / pest / plan), each with severity color, the
  recommendation, the *why* (forecast values), and its SMS-delivery status.
- **Endpoints:** `GET /api/temporal/alerts?farmId=` (confirm farmId filter; extend if needed).
- **Entry:** a bell on **Today**; deep-linked from SMS later.
- **Done when:** a farmer sees "Heavy rain 34mm Sun–Mon → delay urea 4 days" in-app, mirrored to SMS.

### 5.7 Onboarding first-run (new, `app/onboarding.tsx` or inline on Today)
- **Purpose:** turn a cold open into an active session in &lt;30s.
- **Shows:** 1 line of value + "Sign in with phone" + "Tell us about your farm" (drops into Advisor
  with a starter). Optional "Get advice by SMS: On".
- **Done when:** a first-time user reaches a crop recommendation without hunting through tabs.

## 6. Phased implementation plan

> Each phase is self-contained, typecheck-clean, and ends with `expo export` green. Do one per session.

- [ ] **Phase 0 — IA reshape (highest coherence-per-effort).**
  Move `bdapps`, `trace`, `money` **out of farmer nav**; create **Me** (merge account + more) with a
  "How it works (demo)" section housing Trace + BDApps console + connection check. Fold KB into
  Advisor (keep `knowledge` as a hidden Guides route for now). Tabs become Today · Advisor · My Season
  · Market · Me. *Done:* no dev language in the 5 tabs; console/trace still reachable in Me.
- [ ] **Phase 1 — Today dashboard.** Rebuild `index` per §5.1. *Done:* season status + next task +
  weather + alert teaser render from the session; onboarding CTA when empty.
- [ ] **Phase 2 — Alerts inbox.** `api/alerts.ts` + `app/alerts.tsx` per §5.6; bell on Today. Confirm
  `GET /api/temporal/alerts` accepts `farmId` (else backend task, see §7). *Done:* proactive advice
  visible in-app.
- [ ] **Phase 3 — Contextual checkout.** Market buy flow → "Pay from mobile balance" → receipt + SMS;
  Receipts list in Me. Remove the standalone amount-entry console from the farmer path. *Done:* CaaS
  only appears in context.
- [ ] **Phase 4 — My Season hub.** Merge Finance + fertilizer schedule + scenario into `plan`. *Done:*
  plan/money/what-if in one place.
- [ ] **Phase 5 — Advisor tools + onboarding.** Action row (Ask / Diagnose / What if) + first-run
  onboarding. *Done:* one-tap tools; cold-open → recommendation.
- [ ] **Phase 6 — Polish + Bangla sweep + Demo corner.** Finish `t()` coverage on every screen, tidy
  the "How it works (demo)" area, accessibility pass. *Done:* full Bangla; consistent kit everywhere.

## 7. Backend dependencies (note: backend is HOSTED — changes need redeploy)

- **Alerts list:** `GET /api/temporal/alerts` exists; **confirm it filters by `farmId`** for a farmer.
  If not, add a farmer-scoped alerts endpoint. (Redeploy required to reach the hosted app.)
- **Receipts:** confirm a "list my payments" read path exists (else derive from `bdapps_payments`).
- **Reply text:** the intake follow-up sentence is `src/language/localization.ts`
  (`localizeFollowUpReply`) — softening it is a backend edit + redeploy; the friendly field chips
  already compensate client-side.
- Everything else (agrisense message, vision, pest-risk, finance summary, kb search, marketplace,
  payments checkout, channel status, bdapps OTP) is already live on the hosted backend.

## 8. Rubric mapping (keep judges happy)

| Rubric row | Where it lives after the reshape |
|---|---|
| Agentic (20) | Advisor: multi-step plan, gap-filling chips, memory, tool use |
| Accuracy (20) | My Season numbers (deterministic engines) + explainable cards |
| Scope/exec (15) | Clean 5-tab farmer arc that runs end to end |
| KB/RAG (12) | Grounded answer cards + citations inside Advisor |
| **bdapps CaaS (10)** | Market checkout "pay with mobile balance" + raw flow in Me → Demo |
| Explainability (10) | "Why" on every recommendation + collapsible trace + Demo trace |
| Technical (8) | One session model, typed API mirror, kit, i18n |
| Innovation (5) | Leaf diagnosis, proactive Alerts inbox, scenario what-if |

## 9. Conventions (do not reinvent)

- **Kit:** `mobile/src/components/ui.tsx`. **Theme:** `constants/theme.ts` + `useTheme` +
  `useThemeMode`. **i18n:** `useLanguage().t()`, table in `mobile/src/i18n/uiTranslations.ts`
  (mirror any new strings; default Bangla). **Session:** `state/session.tsx`. **Routes:** expo-router
  files in `mobile/src/app`; hide non-tab routes with `<Tabs.Screen … options={{ href: null }} />`
  and reach them via `router.push`. **API mirror rule:** `mobile/src/api/*` mirrors
  `frontend/src/api/*` — change both in one commit.
- **No emojis.** Signal with color + Feather line icons.

## 10. Open decisions

- Alerts as its own tab vs. bell-on-Today (default: bell-on-Today, keep 5 tabs).
- Knowledge: fully fold into Advisor vs. keep a "Guides" browse (default: fold "Ask" into Advisor;
  optional Guides later).
- Onboarding: dedicated route vs. inline empty-state on Today (default: inline on Today first).

## 11. Change log

- 2026-07-25 — Plan created (audit + target IA + phased plan). No code yet.
