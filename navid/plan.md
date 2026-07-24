# navid/plan.md — Implementation Plan (HOW)

> How `navid/spec.md` lands in **this** repo. Reconciles doc-vs-code drift, names real files,
> and orders the work. Read `navid/spec.md` first for the WHAT, `navid/task.md` after for the
> ordered checklist.

---

## 0. Ground truth: stack as built (not as docs/ describe)

`docs/ARCHITECTURE.md` predates the code and says *SQLite / better-sqlite3 / `server/` / `web/` /
`shared/types.ts`*. **The actual repo is different — follow the code, not that doc:**

| Concern | docs/ say | **Actually in repo (use this)** |
|--------|-----------|-------------------------------|
| Runtime | `server/index.ts` | `src/server.ts` + `src/app.ts` (Express 5, ESM, `.js` import specifiers) |
| DB | SQLite / better-sqlite3 | **Prisma 7 + Postgres + pgvector** (`prisma/schema.prisma`, `docker-compose.yml`) |
| Types | `shared/types.ts` | `src/generated/prisma/*` + local interfaces per module |
| Config/flags | `server/config.ts` | `src/config.ts` (`config` object + `assertProductionConfig`) |
| Frontend | `web/` | `frontend/` (Vite + React 19 + Tailwind v4) |
| RAG / vectors | MiniLM + SQLite | **mem0** (`mem0-api` + Neo4j + pgvector) via `src/rag/mem0Client.ts`; mem0 owns embedding + retrieval |

The Tier 0 **entities already have Prisma models** — no schema invention, only a small patch (§2).

---

## 1. Where the code goes

Follow the existing `src/` convention (`routes/`, `middleware/`, `rag/`, `auth/`, `bdapps/`).
New Tier 0 agent code:

```
src/
  agent/
    intake.ts          # extractor prompt wiring, gap check, normalization
    normalize.ts       # units (area→ha), soil words, season-from-date, price→BDT/kg
    ranking.ts         # rankCrops() — deterministic scoring, weights constant
    seasonPlan.ts      # generateSeasonPlan() — stages + date policy + weather notes
    prompts.ts         # system prompt, extractor schema, narrator prompt
    orchestrator.ts    # the 8-step pipeline (spec §0), returns final render payload
  engines/
    financials.ts      # computeFinancials() pure fn + normalizePricePerKg()
  tools/
    weather.ts         # geocodeLocation, getForecast, getClimateNormals (Open-Meteo)
    soil.ts            # getSoilProfile (SRDI district fertility default)
    kb.ts              # calendar / water / variety / price (CSV) + RAG lookups via mem0Client.search
    trace.ts           # withTrace() decorator → writes AgentToolCall rows
  data/                # the 7 CSVs + alias table + soil-fit matrix (data_origin columns)
  routes/
    agent.ts           # POST /api/agent/message (intake turn), GET /api/sessions/:id/trace
  llm/
    provider.ts        # LLM adapter (function-calling) over OpenAI; default gpt-4o,
                       # env-swappable. Extractor + narrator only — never arithmetic.
tests/ (co-located *.test.ts, vitest — matches existing pattern)
```

Wire `agent.ts` into `src/app.ts` next to the existing `/api/*` routers.

---

## 2. Migrations (the one real schema change)

`FarmProfile` has a single `soilType` and no fertility/district split that spec §1.3 requires.

**Plan:** add a Prisma migration `add_soil_fertility_split`:

```prisma
model FarmProfile {
  // ...existing...
  district        String?
  upazila         String?
  soilTexture     String?   @map("soil_texture")   // sandy|loam|clay|silt|unknown
  fertilityClass  String?   @map("fertility_class") // low|medium|high
  fertilitySource String?   @map("fertility_source")// user_soil_test|user_override|srdi_default
}
```

`soilType` stays (back-compat); new code reads `soilTexture` + `fertilityClass`.
**Interim (before migration lands):** stash the four fields in `FarmProfile.metadata` (Json) so
intake is unblocked. Do the migration first if DB is up; fall back to metadata if not.

No other schema change needed — `AgentSession.missingFields`, `AgentToolCall`, `WeatherSnapshot`,
`SeasonPlan(+Item)` already cover intake state, trace, weather, plan, and financials.

---

## 3. The 8-step orchestrator (spec §0 → code)

`orchestrator.ts` runs a bounded plan→act→observe loop (ARCHITECTURE §4.1 intent). Determinism
lives in code; the LLM only extracts fields and writes narrative.

| Step | Module | Persists to |
|------|--------|-------------|
| 1 Intake | `agent/intake.ts` (LLM extractor + `requiredFieldGaps`) | `FarmProfile`, `AgentSession.missingFields` |
| 2 Normalize | `agent/normalize.ts` + `tools/weather.geocodeLocation` | `FarmProfile.lat/lon/district` |
| 3 Ground | `tools/weather.ts`, `tools/soil.ts`, `tools/kb.ts` | `WeatherSnapshot`, `AgentToolCall` |
| 4 Rank | `agent/ranking.ts` | trace rows; candidate list in response |
| 5 Choose | `orchestrator.ts` | selected crop on `AgentSession` |
| 6 Plan | `agent/seasonPlan.ts` | `SeasonPlan` + `SeasonPlanItem[]` |
| 7 Financials | `engines/financials.ts` | `SeasonPlan` money fields |
| 8 Explain | `agent/prompts.ts` narrator + code-built basis block | response payload |

**Recommendation-basis rule:** the basis block is **built in code** from `FarmProfile` +
`AgentToolCall` rows and injected into the reply. The LLM writes narrative *around* it, never the
basis itself (spec §7-original / PRD A5).

---

## 4. Trace: reuse the existing model

`withTrace(session, toolName, purpose, fn)` in `tools/trace.ts` wraps each tool: records
`startedAt`, runs, records `rawResponse`/`status`/`finishedAt`, writes one `AgentToolCall`.
`GET /api/sessions/:id/trace` returns rows grouped by stage for the panel. No new table —
`agent_tool_calls` already exists and is indexed by `sessionId`/`toolName`.

---

## 5. LLM boundary

- **Provider: OpenAI** (single funded key — `OPENAI_API_KEY`). One adapter
  (`llm/provider.ts`), function-calling. Two roles only: **extractor** (intake → JSON fields,
  Bangla-aware) and **narrator** (prose around the code-built basis).
- Default chat model `gpt-4o` (function calling + streaming + vision, so it also covers the
  Tier 2 leaf-photo feature); `gpt-4o-mini` as the cheap swap. Model + key via `src/config.ts`.
- **RAG / embeddings / vectors are NOT the app's job — they go through mem0** (already set up:
  `mem0-api` + Neo4j + pgvector). The app calls `src/rag/mem0Client.ts`: `add()` to ingest KB
  chunks, `search()` to retrieve. mem0 embeds with OpenAI `text-embedding-3-small` (1536-dim,
  matching `vector(1536)`/`RAG_EMBEDDING_DIMENSIONS`) internally — no app-side embedding call, no
  custom retriever. `query_knowledge_base` (in `tools/kb.ts`) is a thin wrapper over `search()`.
- Never let the model do arithmetic, ranking, or date math — those are the deterministic engines
  above.
- Follow `docs/RULES.md` "never invent numbers": if a tool failed, the narrator says so; it may
  not fill the gap.

---

## 6. Data files (`src/data/`)

CSV + a tiny loader is fine (original §8). Each row carries the standard source columns
(spec §7.2). Loader enforces the **mock-isolation** filter (spec §7.3): Tier 0 reads reject
`dataOrigin=mock`. Files: `crops.csv`, `crop_calendar.csv`, `crop_water.csv`, `fertilizer_frg.csv`,
`varieties.csv`, `prices_dam.csv`, `srdi_fertility.csv`, plus `crop_aliases.json` and
`soil_fit_matrix.json`. RAG prose (agronomy text chunks) lives in **mem0**, ingested via
`mem0Client.add` — not in `src/data/` and not embedded by the app.

---

## 7. Reconciled decisions

- **Postgres, not SQLite.** App state in Prisma/Postgres; mem0 (its own Neo4j + pgvector) is
  already wired for RAG/memory. Do not re-introduce SQLite.
- **`src/` layout, not `server/`.** Match existing files.
- **RAG/vectors via mem0, not app code.** No app-side embedding calls, no custom hybrid
  retriever — `mem0Client.add`/`search` only.
- **Prices/agronomy tables as CSV in `src/data/`**, RAG prose in mem0 — split by shape: numbers
  in tables (deterministic engines), prose in mem0 (retrieval + citation).
- **Interim metadata-Json** unblocks intake before the migration; migrate when DB is reachable.
- **Weather cache** = `WeatherSnapshot` rows + in-memory last-good per location.

---

## 8. Test strategy (vitest, co-located)

Mirror original §9 exactly (see `navid/task.md` for the list). `test_missing_data` and
`test_trace` are the two that map straight onto rubric lines — do not cut them. Financials and
units are pure-function golden tests (no DB). Trace test runs the golden farm through the
orchestrator against a test Postgres (docker-compose) or a Prisma mock.

---

## 9. Definition of done for navid's slice

`npm run typecheck` + `npm test` green · the orchestrator drives the full spec §0 path for the
golden farm · every number in the rendered answer resolves to an `AgentToolCall` row · weather
failure path shows the failed call and invents nothing.
