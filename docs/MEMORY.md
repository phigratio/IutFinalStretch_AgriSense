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
| A — Agent core | ☐ | ☐ | server/agent, server/llm, server/tools, prompts |
| B — Domain & data | ☐ | ☐ | server/engines, server/rag, openMeteo, seed data, kb-sources |
| C — Product | ☐ | ☐ | web/, server/routes, server/db, bdapps, README, demo |

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
- D11 — Stack TS end-to-end: Express 5 + SSE, Vite+React+Tailwind, vitest for engines/bdapps
  request shapes · team fluency, one language across members.

## 4. Environment & credentials status (update as they land)

- [ ] OpenAI key in `.env` as `OPENAI_API_KEY` (owner: B) — `gpt-4o` chat tested with curl?
      (same key feeds mem0's embedder)
- [ ] mem0 stack up (owner: B) — `mem0-api` + `mem0-neo4j` running; `mem0Client` add/search round-trips?
- [ ] bdapps Pro app provisioned: APP_ID ☐ · password in .env ☐ · venue public IP whitelisted ☐
      (E1303 = re-check IP) · listener URLs set (ngrok) ☐ · first S1000 seen? ☐
- [ ] Repo created + 3 clones working
- [ ] Test Robi SIM available for on-stage SMS? ☐
- Venue wifi public IP: ☐ (recheck on network change) · Hotspot fallback tested: ☐

## 5. State board (move items; keep terse)

**DONE**
- 24Jul ~11:00 — Planning docs v1 written (PRD/ARCHITECTURE/RULES/PHASES/DESIGN/MEMORY) from
  problem statement + bdapps resources + rubric analysis.

**IN PROGRESS**
- Phase 0 (all): P0-1 repo · P0-2 scaffold (A) · P0-3 keys+KB sources (B) · P0-4 bdapps provisioning (C).

**NEXT UP**
- Phase 1 walking skeleton → CP1 15:00 (chat→weather→trace E2E). Then Phase 2 → CP2 22:00 (full Tier-0).

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

- Team name? (blocks repo creation — decide by 12:00)
- Does the venue share a static public IP for bdapps whitelisting, or NAT that changes? (C asks organizers)
- ~~Is a funded Anthropic/OpenAI key available?~~ **Resolved:** funded OpenAI key held by the
  team → sole LLM provider (D3): `gpt-4o` for agent chat; RAG/memory/embeddings via mem0 (D5),
  which uses the same OpenAI key for `text-embedding-3-small` under the hood.
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
