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
