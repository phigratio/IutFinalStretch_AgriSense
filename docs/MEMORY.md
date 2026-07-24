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
- D3 — **LLM = Gemini 2.5 Flash free tier, 3 rotating keys; Groq llama-3.3-70b failover**
  behind one adapter · no paid APIs available; function calling + vision needed · rejected:
  Anthropic API (no funded key), Ollama local (too slow on our laptops).
- D4 — **Weather = Open-Meteo** (keyless, 16-day, geocoding) with SQLite cache · free + reliable
  + real API for rubric · rejected: OpenWeatherMap (key + quota friction).
- D5 — **Embeddings local via Transformers.js MiniLM; vectors in SQLite; hybrid retrieve** ·
  zero cost/rate-limits, venue-wifi-proof RAG · rejected: hosted vector DBs, API embeddings.
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

- [ ] ⚠ mem0 stack needs `OPENAI_API_KEY` as configured (defaults `gpt-5-mini` +
      `text-embedding-3-small` 1536-dim). If no funded key: reconfigure mem0 to Gemini
      (embedder `text-embedding-004` → dims 768 → schema `vector(1536)` + migration must
      change) — owner: Mujahid, decide by 13:00.
- [ ] Gemini keys ×3 (owner: B) — tested with curl?
- [ ] Groq key (B)
- [ ] bdapps Pro app provisioned: APP_ID ☐ · password in .env ☐ · venue public IP whitelisted ☐
      (E1303 = re-check IP) · listener URLs set (ngrok) ☐ · first S1000 seen? ☐
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

**NEXT UP**
- **Assign the agent-core owner (unowned!)** → then Phase 1 walking skeleton → CP1 15:00
  (chat→weather→trace E2E on the phone). Then Phase 2 → CP2 22:00 (full Tier-0).

**BLOCKED / RISKS WATCHLIST**
- ⚠ **Agent loop has no owner** — it's the 20-pt rubric row; assign at next standup.
- mem0 stack assumes OpenAI key (§4) + docker Postgres/Neo4j/mem0 must all run on the demo
  laptop — check RAM + startup time early.
- bdapps approval latency / IP whitelist — escalate to sponsor mentors if stuck by 13:00.
- Venue wifi client isolation may block phone↔laptop — hotspot is the primary demo network.
- Gemini free-tier RPM during rehearsals — mitigation: key rotation, terse prompts, cached turns.

## 6. Checkpoint results (fill at CP time — honest pass/fail + what was cut)

- CP1 (15:00, weather-grounded chat w/ trace): ☐
- CP2 (22:00, full Tier-0 demo): ☐
- CP3 (01:00, CaaS checkout + cross-session memory): ☐
- Rehearsals ×3 (06:00–08:00): ☐ ☐ ☐ · Backup video recorded: ☐ · DB snapshot: ☐

## 7. Open questions (answer & move to §3 as decisions)

- **Who owns the agent core loop?** (biggest rubric item; Mujahid after mem0 bring-up is the
  natural fit — decide at next standup)
- mem0: funded OpenAI key available, or reconfigure to Gemini (dims 768 + migration)?
- ~~Team name?~~ → repo is `IutFinalStretch_AgriSense`; verify underscore naming with organizers.
- Does the venue share a static public IP for bdapps whitelisting, or NAT that changes? (C asks organizers)
- Is a funded Anthropic/OpenAI key available from any member? (would slot into adapter as D3 fallback-2)
- bdapps TAP doc (dev.bdapps.com/API_Documentation/bdapps_tap_api.html) — confirm CaaS flow
  matches DGD v1.1.3 shapes (C, during P3-C2).

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
