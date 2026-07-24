# navid/task.md — Ordered Checklist

> Derived from `navid/spec.md` (WHAT) + `navid/plan.md` (HOW). Triage from original §11.
> **Must = Tier 0 lives or dies here. Nice = only after the demo dry-run passes.**
> Mark `[x]` as you land each. Keep `npm run typecheck` + `npm test` green throughout.

---

## Phase A — Foundations (unblocks everything)

- [ ] **A1. Schema patch** — Prisma migration `add_soil_fertility_split`: add `district`,
  `upazila`, `soilTexture`, `fertilityClass`, `fertilitySource` to `FarmProfile`
  (plan.md §2). If DB not reachable, use `FarmProfile.metadata` interim and note it. `[Must]`
- [ ] **A2. Trace decorator** — `src/tools/trace.ts` `withTrace()` → writes one `AgentToolCall`
  row per tool call (name, params, rawResponse, status, timings). `[Must]`
- [ ] **A3. Data files** — `src/data/*.csv` (crops, crop_calendar, crop_water, fertilizer_frg,
  varieties, prices_dam, srdi_fertility) + `crop_aliases.json` + `soil_fit_matrix.json`, each row
  with source columns (`sourceName,sourceUrl,sourceDoc,page,retrievedDate,dataOrigin,verificationStatus`). `[Must]`
- [ ] **A4. Loader + mock isolation** — one loader; Tier 0 reads reject `dataOrigin=mock`
  (spec §7.3). `[Must]`
- [ ] **A5. Canonical crop IDs + alias table** — `rice_t_aman, rice_boro, wheat, maize, potato,
  mustard, lentil, onion`; Bangla aliases (spec §7.1). `[Must]`

## Phase B — Intake & normalization (T0-1)

- [ ] **B1. Normalizers** — `src/agent/normalize.ts`: area→ha (acre/decimal/bigha-confirm/kani-ask),
  soil words (bn+en), season-from-**system-date**, `normalizePricePerKg`. `[Must]`
- [ ] **B2. LLM extractor + prompts** — `src/agent/prompts.ts` extractor schema (Bangla-aware),
  `src/llm/provider.ts` OpenAI function-calling adapter (default `gpt-4o`, `OPENAI_API_KEY`). `[Must]`
- [ ] **B3. Gap loop** — `src/agent/intake.ts`: `requiredFieldGaps`, ask only missing (≤3/turn),
  never re-ask, write `AgentSession.missingFields`, one-line summary read-back on completion. `[Must]`
- [ ] **B4. Texture/fertility split** — SRDI district default → `fertilityClass` with
  `fertilitySource`, stated as an overridable assumption (spec §1.3). `[Must]`

## Phase C — Grounding tools (T0-2)

- [ ] **C1. `geocodeLocation`** — Open-Meteo geocoding; ambiguity → confirm. `[Must]`
- [ ] **C2. `getForecast`** — 16-day daily; derive next-7 / next-16 totals + tmean. `[Must]`
- [ ] **C3. `getClimateNormals`** — archive API, average by month **in code**, label
  `historical normal (2016–2025)`. `[Must]`
- [ ] **C4. `getSoilProfile`** — SRDI district fertility default lookup. `[Must]`
- [ ] **C5. Failure + cache policy** — retry once, never invent, failed call visible in trace;
  cache last-good per location (`WeatherSnapshot` + in-memory). `[Must]`

## Phase D — Deterministic engines (T0-3 / T0-5)

- [ ] **D1. `rankCrops`** — `src/agent/ranking.ts`, weights constant in one place; subscores
  seasonFit/waterFit/soilFit/weatherFit/profitPotential/budgetFit; reasons + sources; `<3` fits →
  honest nearest-alternatives (spec §3). `[Must]`
- [ ] **D2. `computeFinancials`** — `src/engines/financials.ts` pure fn: itemized costs, yield,
  revenue, net, ROI, break-even price & yield (spec §5). `[Must]`

## Phase E — Plan generator (T0-4)

- [ ] **E1. `generateSeasonPlan`** — all required stages; urea splits from FRG row (not
  hardcoded); irrigation from water_row × availability. `[Must]`
- [ ] **E2. Date policy** — anchor = farmer date else window midpoint, shown as editable
  assumption. `[Must]`
- [ ] **E3. Weather-note hook** — ≥40 mm rain within ~2 days of a fertilizer task in the 16-day
  window → delay note. `[Must]`

## Phase F — Orchestration & render (T0-6 / T0-8)

- [ ] **F1. Orchestrator** — `src/agent/orchestrator.ts` 8-step pipeline (plan.md §3), persists to
  `SeasonPlan(+Item)`, `AgentSession`. `[Must]`
- [ ] **F2. Recommendation-basis block** — built **in code** from profile + trace, injected;
  narrator writes prose around it (spec §7-orig template). `[Must]`
- [ ] **F3. Routes** — `POST /api/agent/message`, `GET /api/sessions/:id/trace`; wire into
  `src/app.ts`. `[Must]`
- [ ] **F4. Number provenance chips** — attach trace-row id to each printed number. `[Nice]`

## Phase G — Tests (original §9 — do not cut the last two)

- [ ] **G1. `units.test.ts`** — 2 acres→0.8094 ha · 100 decimals→1 acre · maund price→per-kg. `[Must]`
- [ ] **G2. `fertScaling.test.ts`** — dose kg/ha × area linear (1 / 2 / 0.5 ha). `[Must]`
- [ ] **G3. `financials.test.ts`** — golden farm hand-checked; double area ⇒ cost/yield/revenue/
  profit double; per-ha figures unchanged. `[Must]`
- [ ] **G4. `missingData.test.ts`** — unknown crop → no invented numbers, offers covered crops;
  unknown district → asks nearest/manual fertility; weather failure → no invented rainfall,
  failure visible in trace. **Rubric line — do not cut.** `[Must]`
- [ ] **G5. `trace.test.ts`** — golden farm end-to-end → every numeric value in final output maps
  to ≥1 `AgentToolCall`. **Rubric line — do not cut.** `[Must]`
- [ ] **G6. `ranking.test.ts`** — lowering `waterAvailability` lowers `waterFit` for a high-water
  crop (e.g. boro rice). `[Must]`

## Phase H — Nice (only after demo dry-run passes)

- [ ] **H1. `simulate(changes)`** wrapper over `computeFinancials` + old/new diff (first Tier 1
  pick, ~1 h given the pure fn). `[Nice]`
- [ ] **H2. Retrieval smoke set** — ~6 query→expected-chunk pairs against **mem0**
  (`mem0Client.search`), script prints hits. `[Nice]`
- [ ] **H3. `verificationStatus`/`verified_by` polish · number-provenance chips UI ·
  weather-note → proactive alerts.** `[Nice]`

---

### Definition of done (navid's slice)
`npm run typecheck` + `npm test` green · orchestrator drives the full spec §0 path for the golden
farm · every number in the answer resolves to an `AgentToolCall` · weather-failure path invents
nothing and shows the failed call in the trace.
