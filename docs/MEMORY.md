# MEMORY — AgriSense living context (read me FIRST every session)

> Purpose: any human or AI session starts here and knows exactly where the project stands —
> no re-deriving, no re-litigating. Update rules: RULES.md §5 (append, timestamp, initials,
> never delete — strike through). Then read PRD → ARCHITECTURE → PHASES → DESIGN → RULES.
>
> **AI session bootstrap:** *"Read docs/MEMORY.md then the other 5 docs. I am member <A|B|C>
> working on <task-ID from PHASES.md>. Plan first, stay in my owned folders (ARCHITECTURE §3),
> never copy from the pre-event repo, no AI trailers in commits, update MEMORY.md at end."*

---

## 1. Mission snapshot (stable)

- Event: IUT 12th ICT Fest — bdapps Agentic AI Hackathon, Final Round. **Window: 24 Jul 09:00
  → 25 Jul 09:00, judging 25 Jul 10:00.** Internal freeze 08:00, final push 08:20.
- Build: **AgriSense AI** — autonomous farm advisor: conversational intake → live weather →
  RAG-grounded crop ranking → dated season plan → inspectable financials → explanations with
  citations → visible agent trace; plus bdapps CaaS checkout, persistent memory, scenario sim,
  proactive alerts. Full rubric mapping: PRD §6.
- Judged behaviors to show in ONE demo pass: tool use, multi-step planning, gap-filling,
  memory, explainability (PRD §2).

## 2. Team & ownership (FILL IN — P0-1)

| Member | Name | GitHub | Owns |
|--------|------|--------|------|
| A — Agent core | ⚠ **UNASSIGNED — decide at next standup (20-pt rubric row!)** | ☐ | agent loop, LLM adapter, tools wiring, prompts |
| B1 — Memory & schema | Mujahid | phigratio | prisma/schema.prisma, src/rag (mem0), docker infra |
| B2 — Knowledge base | Navid | navid1111 | KB sources, ingestion, retrieval, engines data |
| C — Product & bdapps | Labib | Kashshaf-Labib | mobile/ (Expo RN app), src/bdapps, src/payments, routes, README, demo |

- Team name: ☐ → repo `<TeamName>AgriSense` (☐ URL once created)
- Demo laptop: ☐ · Backup narrator: ☐

## 3. Decision log (what · why · rejected alternative — one line each)

- D1 24Jul ~10:30 — **Fresh repo; pre-event `iut_final_stretch/` is reference-only, zero
  copying** · rules ban pre-built code, DQ risk outweighs any speedup · rejected: porting it.
- D2 — **Custom agent loop** (plan→act→observe, zod tools, trace bus) over LangChain/framework
  · full control of trace + gap-filling + judges' "not a wrapper" Q&A · rejected: heavy framework.
- D3 — **LLM = OpenAI `gpt-4o`** (funded team `OPENAI_API_KEY`) behind one adapter · function
  calling + streaming + vision (covers T2-4) in one provider, simpler than a rotation/failover
  chain · `gpt-4o-mini` env swap if rate-limited · rejected: Gemini/Groq free tiers (superseded
  once a funded OpenAI key was available), Ollama local (too slow on our laptops).
- D4 — **Weather = Open-Meteo** (keyless, 16-day, geocoding) with SQLite cache · free + reliable
  + real API for rubric · rejected: OpenWeatherMap (key + quota friction).
- D5 — **RAG / vectors / memory = mem0** (already set up: `mem0-api` + Neo4j graph + pgvector;
  embeds with OpenAI `text-embedding-3-small`, 1536-dim, matching the `vector(1536)` schema).
  App integrates via `src/rag/mem0Client.ts` (`add`/`search`); ingest KB ahead of demo so
  retrieval is offline-safe · one memory/RAG layer for KB + conversation, graph + semantic recall
  for free · rejected: app-side embedding calls, local Transformers.js MiniLM (384-dim,
  mismatched), custom hybrid retriever, hosted vector DBs.
- D6 — **SQLite (better-sqlite3) single file** for ALL state incl. traces & KB · zero infra at
  venue, cross-session memory for free · rejected: Postgres+Prisma (migration friction).
- D7 — **All math in deterministic TS engines; LLM never computes numbers** · accuracy rubric
  20pts + inspectability ("change input → outputs change") · rejected: LLM-computed plans.
- D8 — **bdapps CaaS treated as REQUIRED** (own 10-pt rubric row) — checkout embedded in the
  fertilizer-order story so it feels native, real sandbox in demo, `MOCK_BDAPPS` for dev only.
- D9 — **Market prices & suppliers = seeded from public DAM bulletins/mock catalog, dated +
  declared** · live scraping brittle in 24h · README honesty per rules.
- D10 — Commits by team members' own identities, conventional format, **no AI trailers**;
  README lists tools/APIs used per submission requirements. AI assistants are rules-allowed.
- D11 — Stack TS end-to-end: Express 5 + SSE, ~~Vite+React+Tailwind~~ (superseded by D12),
  vitest for engines/bdapps request shapes · team fluency, one language across members.
- D12 24Jul ~11:00 — **Frontend = React Native (Expo, Expo Go on Android phone)**, replaces
  the planned Vite web app · pairs perfectly with bdapps (receipt SMS lands on the demo phone
  on stage); backend stays the single brain, app is a thin client, all bdapps calls
  server-side · rejected: web dashboard.
- D13 24Jul ~11:00 — Team is building in THIS repo on **Postgres+Prisma+pgvector, docker,
  self-hosted mem0+Neo4j** (Mujahid's PR #1) — supersedes D6 (SQLite) and the fresh-repo
  execution of D1. D1's compliance warning stands as logged 24Jul in §8 — team's call, made
  with eyes open. Memory = mem0 (`RagMemory`); RAG chunks = `RagDocument/RagDocumentChunk`
  in pgvector.

## 4. Environment & credentials status (update as they land)

- [ ] OpenAI key in `.env` as `OPENAI_API_KEY` (owner: B) — `gpt-4o` chat tested with curl?
      (same key feeds mem0's embedder)
- [ ] mem0 stack up (owner: B) — `mem0-api` + `mem0-neo4j` running; `mem0Client` add/search round-trips?
- [~] bdapps Pro app provisioning IN PROGRESS (24Jul, Labib): Allowed Host IP =
      202.53.174.17 (current network — re-check on hotspot switch, E1303 = stale IP) ·
      SMS shortcode **21213**, keyword **agrisms** (lowercase) · USSD service code **213**,
      keyword **74756** (dial `*213*74756#`) · all traffic charging toggles = NO (only CaaS
      direct debit ever charges) · listener URLs = example.com placeholders (swap to ngrok
      if inbound SMS/USSD is demoed) · APP_ID ☐ · password in .env ☐ · first S1000 ☐
- [ ] Repo created + 3 clones working
- [ ] Test Robi SIM available for on-stage SMS? ☐
- Venue wifi public IP: ☐ (recheck on network change) · Hotspot fallback tested: ☐

## 5. State board (move items; keep terse)

**DONE**
- 24Jul ~11:00 — Planning docs v1 written (PRD/ARCHITECTURE/RULES/PHASES/DESIGN/MEMORY) from
  problem statement + bdapps resources + rubric analysis.
- 24Jul 10:41 — Prisma schema (farmer/farm/session/tool-call-trace/weather/plan/payment) +
  mem0 RAG infra (docker: mem0-api + Neo4j + pgvector) merged — PR #1, Mujahid (823f6a0).

**IN PROGRESS**
- Navid: knowledge base pipeline (sources → ingestion → retrieval).
- Mujahid: mem0/memory layer bring-up (+ resolve the OpenAI-key question in §4).
- Labib: bdapps provisioning + payment service + Expo RN app — detailed plan in
  `docs/plans/PLAN-labib-bdapps-react-native.md` (deadlines: S1000 by 12:00, checkout svc
  13:30, app skeleton CP1 15:00).
- Labib SHIPPED (commits 6c0f9d9→3d4e294): MOCK_BDAPPS offline mock + .env.example;
  payments checkout service (list PI→balance→debit→SMS, persists bdapps_payments, logs CaaS
  steps to agent_tool_calls via AgriSenseStore) + /api/payments routes, live-verified;
  Expo SDK 57 app in mobile/ — Home (backend connection check, auto-resolves laptop from
  Metro host), Chat (drives /api/agrisense/message, inline expandable tool-trace chips,
  missing-field prefill chips), Plan (crop cards + season timeline + financials), Money
  (CaaS checkout w/ receipt cards + honest MOCK badge), Trace (persisted session trace).
  Backend suite 63 tests green; mobile tsc + expo web export green. NOTE: machine Node
  upgraded 20.12→24 LTS (Prisma 7 needs ≥20.19) — other members may need the same.
  STILL OPEN for Labib: real bdapps provisioning (APP_ID/password/IP whitelist → first real
  S1000), phone-device smoke test via Expo Go, scrcpy setup.

**NEXT UP**
- **Assign the agent-core owner (unowned!)** → then Phase 1 walking skeleton → CP1 15:00
  (chat→weather→trace E2E on the phone). Then Phase 2 → CP2 22:00 (full Tier-0).

**BLOCKED / RISKS WATCHLIST**
- bdapps approval latency / IP whitelist — started at P0 deliberately; escalate to mentors if stuck by 13:00.
- OpenAI rate limits / spend during rehearsals — mitigation: terse prompts, cached turns,
  `gpt-4o-mini` swap via `OPENAI_CHAT_MODEL`, watch the billing dashboard.

## 6. Checkpoint results (fill at CP time — honest pass/fail + what was cut)

- CP1 (15:00, weather-grounded chat w/ trace): ☐
- CP2 (22:00, full Tier-0 demo): ☐
- CP3 (01:00, CaaS checkout + cross-session memory): ☐
- Rehearsals ×3 (06:00–08:00): ☐ ☐ ☐ · Backup video recorded: ☐ · DB snapshot: ☐

## 7. Open questions (answer & move to §3 as decisions)

- **Who owns the agent core loop?** (biggest rubric item; Mujahid after mem0 bring-up is the
  natural fit — decide at next standup)
- ~~mem0: funded OpenAI key available, or reconfigure to Gemini?~~ → resolved, D14 (OpenAI ×3).
- ~~Team name?~~ → repo is `IutFinalStretch_AgriSense`; verify underscore naming with organizers.
- Does the venue share a static public IP for bdapps whitelisting, or NAT that changes? (C asks organizers)
- ~~Is a funded Anthropic/OpenAI key available?~~ **Resolved:** funded OpenAI key held by the
  team → sole LLM provider (D3): `gpt-4o` for agent chat; RAG/memory/embeddings via mem0 (D5),
  which uses the same OpenAI key for `text-embedding-3-small` under the hood.
- bdapps TAP doc (dev.bdapps.com/API_Documentation/bdapps_tap_api.html) — confirm CaaS flow
  matches DGD v1.1.3 shapes (C, during P3-C2).

- 24Jul ~17:30 — Claude session (with Labib) — **Mobile app brought to feature parity with
  the web frontend** (teammates had built out `frontend/` into a rich AgriSense workspace:
  AgentIntake/AgriSense/Bdapps/Marketplace/Payments/Temporal pages). Synced mobile to the
  evolved backend contract and replicated web features (commits 88657f1→d781d0e):
  (1) API layer + session state mirror `frontend/src/api/*` — richer weather (humidity/ET0/
  soil-moisture), `retrievedEvidence` RAG, itemized `costBreakdown` financials, workflow
  stage / preferredLanguage / triggerReason on send; (2) Chat: language toggle (en/banglish/
  bn) + starter-prompt chips; (3) Plan: full web stage panels (weather, RAG evidence w/
  citations, crop factor breakdown, itemized costs, financial-invariant check); (4) new
  **Market** tab (supplier compare + price intel + sell/store/wait + mem0 + trace) and
  **Bdapps** console tab (SMS/OTP/balance/charge test routes). 7 tabs now. tsc + expo web
  export green. NOTE for team: `mobile/src/api/types.ts` mirrors `frontend/src/api` — change
  both in one commit. Mobile still runs via Expo **web** (localhost:8081) since Expo Go SDK 57
  build is stuck in App/Play Store review (SDK 54 clients can't load it) — verified in Expo's
  changelog, outside our control.

- 24Jul ~18:00 — Claude session (with Labib) — **bdapps subscription CONFIRMED / REGISTERED**
  (2nd confirmation SMS arrived: "Tk 1.00+VAT charged, monthly charge applicable, Welcome to
  AgriSense! You are now subscribed"). Definitive live status (commits eb32ada, f87ecb9):
  - ✅ **Working through the app, real:** SMS send (S1000), subscription getStatus
    (REGISTERED), OTP request/verify for NEW numbers. **BUT** all subscriber-bearing calls
    require the **masked subscriberId** from otp/verify — the raw `tel:8801…` is rejected
    E1951 even when REGISTERED. Built `src/bdapps/subscriberStore.ts`: captures masked id at
    otp/verify (keyed by referenceNo) and resolves every later call to it; wired into
    routes/bdappsTest.ts + payments/service.ts. For already-REGISTERED numbers (bdapps then
    refuses fresh OTP → E1351) seed via `BDAPPS_KNOWN_SUBSCRIBERS` env (masked id is stable
    per number+app). Demo number seeded in .env. **Verified: SMS S1000 through
    /api/bdapps/sms and subscription REGISTERED through the app.**
  - ❌ **Still blocked, 100% bdapps-side:** CaaS `caas/list/pi` + `caas/balance/query` return
    raw HTTP 404 (routes not provisioned for this app); `caas/direct/debit` returns **E1371
    "App do not accept payments from given Payment Instrument"** for Mobile Account (tried
    all name variants). "Limited production" approval + REGISTERED subscription did NOT
    activate CaaS. Checkout now treats list/pi+balance as optional (skips 404s) and reaches
    the debit, returning clean E1371 — will complete a real charge the instant bdapps
    enables CaaS, zero code change.
  - **ESCALATION STILL OPEN — email support@bdapps.com / call 09678232777, exact ask:**
    "APP_139258 is REGISTERED and subscription charging works, but CaaS is not active:
    caas/direct/debit → E1371 'App do not accept payments from given Payment Instrument'
    (Mobile Account enabled in provisioning), caas/balance/query + caas/list/pi → raw 404.
    Please activate CaaS direct-debit / payment instruments for this app."
  - Infra note during this: teammate added `multer` dep + KB migrations (kb_ingestion_jobs);
    ran `npm install` + `prisma generate` + `migrate deploy` to get backend booting.

- 24Jul ~20:10 — Claude session (with Labib) — **Started BDApps feature integration, build
  order = backend → web → mobile** (web has auth already, so it's the cheapest backend test
  bed; mobile has none so BDApps OTP will become its login). Plan detail:
  docs/plans/BDAPPS-INTEGRATION-PLAN.md §7 (P1-P7). **P1 shipped (58883ae):** channel
  activation core. ⚠ **Schema change for Mujahid to note:** additive migration
  `20260724140105_add_bdapps_channel` adds `bdappsSubscriberId/channelActivatedAt/premium/
  premiumSince` to `FarmerProfile` (sorts after 090000 which creates the table — safe on
  fresh migrate deploy). New `src/bdapps/channel.ts` = single source of truth for "can BDApps
  reach this farmer?" (masked id persisted to profile + write-through to subscriberStore).
  Wired the **canonical capture point**: `/bdapps/subscription` webhook → activateChannel +
  premium. New `GET /api/channel/status`. Live-verified end-to-end. Next: P2 (proactive
  alert → real SMS, hooks the existing Temporal weatherAlertSweep). Anyone pulling: run
  `npx prisma generate && npx prisma migrate deploy`.

- 24Jul ~20:20 — Claude session (with Labib) — **P2 shipped (a03edb2): proactive alert →
  real SMS delivery** — the headline "agent reaches the farmer off-app" feature. New
  `src/notifications/smsDispatcher.ts` delivers pending `proactive_alerts` by SMS to the
  farmer's masked BDApps channel (gated on channel activation → `skipped_no_channel` if
  inactive). Additive migration `20260724210000_add_alert_delivery` (delivery_status/
  sms_message_id/delivered_at on proactive_alerts). Hooked into the weather + plan-task
  Temporal sweeps (best-effort). Dev route `POST /api/dev/{seed-demo-alert,deliver-alerts}`
  for on-demand demo. **LIVE-VERIFIED: seeded alert → delivered → real BDApps messageId
  12607242018482171 persisted, delivery_status=sent, real SMS to 01805758966.** tsc + 37
  tests green. ⚠ Migration note: `prisma migrate dev` is broken by teammates' parallel-
  timestamp migrations (shadow-DB replay hits marketplace_orders ordering) — use
  `migrate deploy` (works fine); my P2 migration was hand-written + deployed. Next: P3
  (BDApps login provider, backend→web→mobile).

- 24Jul ~21:15 — Claude session (with Labib) — **P3 shipped (edb736f): BDApps phone
  identity / OTP login.** Confirmed model with Labib: BDApps = **verification-to-enable-
  features**, NOT a separate login silo; on mobile (no auth) it doubles as sign-in via the
  SHARED identity. `src/auth/bdappsAuth.ts` (mirrors GoogleOAuthService): OTP request/verify
  → `upsertOAuthUser(provider:"bdapps", providerUserId:phone-digits, synthetic email, role
  user)` → same JWT as email/Google; captures channel + links FarmerProfile.userId when a
  masked id is present (else channel activates later via subscription webhook — identity
  doesn't depend on it). 2 additive routes `/auth/bdapps/otp/{request,verify}`. **Non-
  breaking:** widened `UpsertOAuthUserInput.provider` to `"google"|"bdapps"` (type-only, both
  store impls already persist any provider string) — Navid's 12 auth tests still green.
  Also fixed channel.activate to store RAW mobile (was tel:-normalized → lookup mismatch with
  seed/onboarding/env). **Live-verified (mock OTP, real number blocked by E1351):** token
  works with Navid's `/auth/me`; FarmerProfile linked (user_id + masked id); channel active.
  42 tests green. ⚠ Coordinate w/ Navid: phone is the canonical link so an email-signup +
  bdapps-verify with the same phone don't fork into 2 AppUsers. Backend for P1/P2/P3 done;
  next = web frontend (verify-phone button) then mobile sign-in, per build order.

- 24Jul ~21:45 — Claude session (with Labib) — **R1 + web phase shipped.** R1 (aea518e):
  pest/disease alerts now deliver by SMS (hooked deliverPendingAlerts into pest alert
  creation; dispatcher is alert-type-agnostic so weather+plan+pest+scenario all covered) —
  live-verified a blast-risk SMS. **Web-backend (225ec31):** added authenticated
  `POST /auth/bdapps/verify-phone` + `BdappsAuthService.activatePhoneForUser` — a logged-in
  web user (email/Google) verifies their phone to enable BDApps; channel activates on THEIR
  existing AppUser (no new user/token) — sidesteps the duplicate-user problem (R3). Live-
  verified: email signup → verify-phone → channelActive, no new token. **Web-UI (a3930f3):**
  `frontend/src/api/channel.ts` + a Bengali "এসএমএস সতর্কতা" (SMS alerts) card on
  UserDashboard — farmer verifies the onboarding phone → OTP → channel active; frontend tsc +
  vite build green. bdapps login route flow: `/auth/bdapps/otp/request` (shared) →
  `/auth/bdapps/otp/verify` (mobile SIGN-IN, new user+token) OR `/auth/bdapps/verify-phone`
  (web, authenticated, activates channel on current user). Next: mobile sign-in UI (reuses
  these endpoints). NOTE: keep running `prisma generate && migrate deploy` after pulls —
  teammates keep evolving the schema (imageUrl, tenant phone, voice route, etc).

- 24Jul ~22:15 — Claude session (with Labib) — **Mobile BDApps phone sign-in shipped
  (f60b92f)** — completes the backend→web→mobile build order. Mobile had NO auth; phone-OTP
  now signs the farmer in on the SHARED backend identity (`/auth/bdapps/otp/*`), giving
  mobile the login + Tier-1 persistent identity it lacked. Added: cross-platform token store
  (`mobile/src/api/tokenStore.ts` — localStorage web / in-memory native, no new dep),
  `apiFetch` now attaches the bearer token, `mobile/src/api/auth.ts`, `mobile/src/state/
  auth.tsx` AuthProvider (bootstraps from stored token via /auth/me → returning farmer stays
  in), and an **Account tab** (phone→OTP→verified, shows farmer + SMS-channel status + sign
  out). 8 mobile tabs now; tsc + expo web export green. NOTE: phigratio upgraded the weather
  sweep to emit a proper "Delay nitrogen application by N days → move window to <dates>"
  alert (impacted-task aware) — flows straight into the P2 SMS dispatcher. BDApps integration
  now spans identity (web verify + mobile sign-in), reach (weather/plan/pest alerts → real
  SMS), and payment (CaaS checkout, blocked only on bdapps activation). Remaining: P4 inbound
  SMS keywords, P5 USSD menu (both need ngrok), P6 premium gating, P7 marketplace CaaS buy.

- 24Jul ~23:30 — Claude session (with Labib) — **ALL BDApps feature phases complete
  (P1-P7 + R1).** This session: `/bdapps/` Nginx proxy confirmed live (b5db839, phigratio);
  2nd bdapps app provisioned (21213/agrilive, USSD *213*74757#, CaaS 5-100). Shipped:
  **P4 inbound SMS keyword router** (65d4fe1 — START opt-in/STOP/PLAN/WEATHER/HELP, Flow D),
  **P5 AgriSense USSD menu** (c946d3d — dial-in advice/weather/opt-in, Flow E), **P6 premium
  gating** (026e54f — ALERTS_REQUIRE_PREMIUM gates alert SMS on subscription; dev
  /api/dev/set-premium), **P7 marketplace CaaS Buy** (b0ef33f — native checkout on web
  Marketplace + mobile Market tab: complete checkout → operator balance deduction → receipt,
  the Tier-2 payment-gateway task; additive, marketplace features intact). Re-checked Tier-2
  problem-statement wording with Labib: payment gateway now shown natively in the buy flow
  AND the Payments console (raw CaaS request/response) AND the mobile Money tab + Trace.
  All backend/web/mobile tsc + builds green; every phase live-verified in mock. **BDApps
  integration is feature-complete across identity + reach + payment.** Only external blocker:
  bdapps must ACTIVATE CaaS on the app (E1371) for a real on-stage charge — else demo CaaS
  in MOCK_BDAPPS (declared). Node/prisma: keep `prisma generate && migrate deploy` + per-app
  `npm install` after pulls (leaflet dep landed this session).

## 8. Session log (append-only: `HH:MM — <who> — <what changed>`)

- 24Jul 11:00 — Claude session 1 (with A) — Read problem statement, bdapps cheatsheet/DGD/
  setup guide, demo PHP, and pre-event repo; produced the six planning docs; flagged
  compliance rule → D1; proposed architecture/phases; this file seeded. Next action for team:
  execute Phase 0 (P0-1..P0-5) immediately.
- 24Jul 11:15 — Claude session 1 (with A) — Planning docs pushed to repo main (ba71caa) so
  all members can pull them. GitHub reports the repo was renamed →
  github.com/phigratio/IutFinalStretch_AgriSense (local origin URL updated). ⚠ Note: this is
  the pre-event repo — per D1/RULES §1 the SUBMISSION repo must be fresh with window-only
  code; recommended: create it now (P0-1) and keep this repo for planning/reference. Also
  verify naming with organizers: required pattern is `TeamNameAgriSense` (example shows no
  underscore).
- 24Jul 11:10 — Claude session 1 (with Labib) — Reviewed teammate work (schema + mem0 PR #1,
  .gitignore PR #2) and pre-event bdapps client coverage. Logged D12 (Expo React Native app)
  + D13 (build on this repo / Postgres+mem0 stack). Wrote Labib's workstream plan →
  `docs/plans/PLAN-labib-bdapps-react-native.md`. Flagged: agent loop UNOWNED, mem0 needs
  OpenAI key or Gemini reconfig, venue-wifi/hotspot risk. Roles table (§2) filled.
- 24Jul ~13:00 — Claude session (with Labib) — Iterative build of Labib's workstream, 6
  commits pushed to main (see IN PROGRESS/SHIPPED note in §5): bdapps mock mode, payments
  checkout service + routes (63 backend tests green, live-verified in mock mode), Expo
  SDK 57 app with Home/Chat/Plan/Money/Trace tabs wired to Mujahid's /api/agrisense
  endpoints + /api/payments. Node upgraded to 24 LTS on Labib's machine (Prisma 7 needs
  ≥20.19). Next for Labib: bdapps provisioning → first real S1000, Expo Go smoke on phone,
  scrcpy. Contract note: mobile/src/api/types.ts mirrors backend contracts — change both
  sides in one commit.
- 24Jul 11:30 — Claude session 1 (with Labib) — **$50 OpenAI credit claimed by each member
  (~$150 total)** → D14: LLM = OpenAI `gpt-5-mini`, embeddings `text-embedding-3-small`
  (1536 — schema unchanged), mem0 docker defaults work as-is; Gemini/Groq demoted to
  failover. mem0 open question closed. Mujahid: set `OPENAI_API_KEY` in `.env` + compose env
  and bring the stack up. Navid: embed KB chunks with `text-embedding-3-small` only.
- 24Jul ~15:15 — Claude session (with Labib) — **Local infra live via docker:** postgres
  (pgvector) up with host port 5432 mapped (compose change), all Prisma migrations applied
  incl. multitenant KB; mem0-api + neo4j building. `.env` fixes: leading space in
  OPENAI_API_KEY (broke auth silently — heuristic fallback masked it), MEM0_API_URL
  8888→8890 (compose default). **Cross-boundary edit announced:** fixed demo-critical bug in
  Mujahid's `weatherTool.ts` — geocoder resolved "Bogura" to Rostov Oblast, RUSSIA
  (count=1, no country bias); now BD-first with renamed-district aliases; verified e2e
  (Bogra, Rajshahi 24.85/89.37; Banglish intake parsed; full plan returned). Mujahid please
  review c40228e. Chat now works end-to-end against Postgres + OpenAI.

- 24Jul ~16:10 — Claude session (with Labib) — **First real bdapps sandbox tests against
  APP_139258** (test number 01805758966, real Robi SIM). Password was in provisioning-email
  SPAM, not the portal UI. Findings (raw curl diagnostics, not through our app code):
  - `subscription/otp/request` + `/verify` → **S1000**, works cleanly with the raw
    `tel:8801805758966` address. Real SMS OTP delivered and verified.
  - `sms/send`, `subscription/send`, `subscription/getStatus` with the **raw** `tel:88018...`
    address → **E1951** "Format of the address is invalid Or User Already UnRegistered"
    (undocumented in our DGD/cheatsheet). Retrying the SAME calls with the **masked
    `subscriberId` returned by `otp/verify`** → `sms/send` **succeeds (S1000)**,
    `getStatus` **succeeds (S1000, subscriptionStatus: "INITIAL CHARGING PENDING")**.
    **Root cause: for this app's config (Subscriber Confirmation Required=YES), bdapps
    requires the masked subscriberId from OTP verify for all subsequent calls — a raw
    farmer-entered phone number is rejected.** Our client (`toTelAddress`) already
    passes masked ids through unchanged, so no code bug — but every caller (payments
    checkout, agent's future send_sms tool) is currently passed the raw phone number.
  - `caas/direct/debit` with masked id → progressed to **E1371** "App do not accept
    payments from given Payment Instrument" (no longer a format error).
  - `caas/balance/query` and `caas/list/pi` → **raw HTTP 404 from bdapps' own web
    server** (F5 load-balancer error page), with EITHER raw or masked subscriberId. This
    is not a code/format issue — those two routes appear undeployed/unrouted for this
    app on bdapps' infra.
  - Subscriber remains stuck at `INITIAL CHARGING PENDING` (never flips to REGISTERED)
    despite repeated `subscription/send action:1` (→ E1351 "already registered" once
    masked id used). Likely needs a real operator-side confirmation prompt to the
    subscriber, which may depend on our (placeholder) subscription notification URL,
    or may just need time/mentor help in sandbox.
  - **ESCALATE TO BDAPPS MENTORS (exact ask):** "(1) `/caas/balance/query` and
    `/caas/list/pi` return raw 404 Not Found for APP_139258 — are these routes active
    for our app? (2) subscriber tel:8801805758966 is stuck at `INITIAL CHARGING PENDING`
    after OTP verify + subscribe — how do we get to REGISTERED so `direct/debit` accepts
    Mobile Account (currently E1371)?"
  - **Action item (not yet implemented, needs a team decision):** if masked-id-first
    turns out to be required for this app config generally (not just a sandbox quirk),
    the checkout flow needs an OTP-verify step before first charging a new farmer number,
    and payments/service.ts + agent tools should store/reuse the masked subscriberId per
    farmer instead of the raw phone. Flagging as a design decision, not silently changed.
- 24Jul ~16:15 — Claude session (with Labib) — App **APP_139258 approved to "limited
  production"** by bdapps. Retested all 3 blockers immediately after: **no change** —
  `direct/debit` still E1371, `balance`/`list/pi` still raw 404, subscription still
  `INITIAL CHARGING PENDING`. So general production approval ≠ CaaS activation; they
  appear to be separate approval tracks. Real Robi balance topped up to ৳100 (was ৳0) —
  clears one blocker for the eventual ৳5 test charge.
  Labib then received a **real inbound confirmation SMS from bdapps/Robi** on
  01805758966 (Bangla): "Thank you for confirming your subscription. To use the
  application, please wait for a confirmation SMS from bdapps. To unsubscribe, send
  STOP agrisms to 21213. Call 09678232777 (9am-6pm) for info." — confirms SMS
  shortcode/keyword (21213/agrisms) is fully wired live. Rechecked status right after:
  **still INITIAL CHARGING PENDING** — this is a first-stage (telecom-side) confirmation;
  a second bdapps-side confirmation is still pending, appears async/backend-driven, not
  triggerable via any API call we have. **Recommended action: call 09678232777 (bdapps
  support, 9am-6pm) directly**, reference APP_139258 + INITIAL CHARGING PENDING + missing
  second confirmation SMS, frame as hackathon time pressure.
