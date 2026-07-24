# navid/spec.md — Tier 0 Agent Path (WHAT)

> Companion to `docs/PRD.md` (§4 Tier 0), `docs/ARCHITECTURE.md`, and the original
> *AgriSense — Tier 0 Agent Implementation Spec (v2)*. This file is the **repo-accurate**
> restatement of that spec: the original is Python-flavored; **our stack is
> TypeScript / Express 5 / Prisma 7 / Postgres + pgvector** (see `prisma/schema.prisma`).
> Every entity below already has a Prisma model — no new storage engine.
>
> **Owner:** navid · **Scope:** the judged Tier 0 demo path, end to end.

---

## 0. The judge demo path (build exactly this)

```
Vague farmer message
  → intake loop      (fill 6 required fields, ask only what's missing)
  → normalize        (ha, BDT, district+lat/lon, canonical crop/season IDs)
  → ground           (getForecast, getClimateNormals, getSoilProfile, KB lookups)
  → rankCrops        (≥3, deterministic scores, visible reasons)
  → farmer picks     (or default to top-ranked, marked "my recommendation")
  → generateSeasonPlan  (dated calendar, land prep → harvest)
  → computeFinancials   (itemized, ROI, break-even)
  → render answer with code-generated "Recommendation basis" + trace panel
```

If a feature is not on this path, it waits. Everything else is decoration.

---

## 1. Conversational intake (T0-1 · A3 gap-handling)

### State — persisted to `AgentSession.metadata` during intake, then `FarmProfile` when complete

`AgentSession.missingFields: String[]` holds the live gap list. Because current `FarmProfile`
columns are non-null, **do not create a partial farm row** while gaps remain. Persist the draft
state in `AgentSession.metadata.intakeState`; once all six required fields are present, create or
update `FarmProfile`. Store canonical `areaHa` for engines and also populate existing `sizeAcres`
for back-compat display/API code. One-turn/intake state:

```ts
interface IntakeState {
  // location
  locationText?: string; district?: string; upazila?: string; lat?: number; lon?: number;
  // area
  farmSizeValue?: number; farmSizeUnit?: "acre" | "decimal" | "bigha" | "kani" | "ha";
  areaHa?: number;
  // soil — texture and fertility are SEPARATE (see §1.3)
  soilTexture?: "sandy" | "loam" | "clay" | "silt" | "unknown";
  fertilityClass?: "low" | "medium" | "high";
  fertilitySource?: "user_soil_test" | "user_override" | "srdi_default";
  // rest
  waterAvailability?: "rainfed" | "limited_irrigation" | "reliable_irrigation";
  budgetBdt?: number;
  targetSeason?: "kharif1" | "kharif2_aman" | "rabi" | "boro";
}

const REQUIRED = ["district", "areaHa", "soilTexture",
                  "waterAvailability", "budgetBdt", "targetSeason"] as const;
```

> **Schema gap to patch (see plan.md §Migrations):** `FarmProfile` today has a single
> `soilType` string, `sizeAcres`, and no fertility/district split. Add `areaHa`, `district`,
> `upazila`, `soilTexture`, `fertilityClass`, `fertilitySource`. Also add
> `AgentSession.metadata` for draft intake state and `AgentSession.selectedCrop` for the choose
> step. Until migrated, hold draft intake in `AgentSession.summary` only as an emergency fallback;
> prefer doing the migration first.

### Loop

1. Each farmer message → LLM extractor (function call) fills any fields it can, **including from
   Bangla** ("২ বিঘা", "দোআঁশ মাটি").
2. Merge extracted fields into `AgentSession.metadata.intakeState`, then
   `missing = REQUIRED.filter(f => state[f] == null)` → write to `AgentSession.missingFields`.
3. If `missing.length`: ask **one** follow-up covering ≤2–3 missing fields, phrased for a farmer.
   **Never re-ask a filled field** (context pins known fields — A4).
4. When complete → confirm a one-line summary back, persist the complete `FarmProfile`, then proceed.

### Normalization (once, at intake)

- **Area → ha:** acre ×0.4047 · decimal ×0.004047 · bigha → **confirm** "standard 33-decimal
  bigha?" then ×0.1338 · kani varies regionally → ask in decimals instead. Derive `areaHa`,
  keep original for display.
- **Soil words:** বেলে/sandy→sandy · দোআঁশ/loam→loam · এঁটেল/clay→clay · পলি→silt.
- **Season:** derive candidates from **system date** (`new Date()`, not hard-coded July);
  map aliases ("Aman"/"রোপা আমন"→kharif2_aman, …).
- **Location:** free text → `geocodeLocation()` (§2) → district + lat/lon; confirm on ambiguity.

### 1.3 Texture vs fertility (biggest agronomic-bug risk)

FRG doses key off **soil fertility level / soil test**, not texture. **Never** map "loam = medium".

```
fertilityClass :=
  farmer soil test        → use it   (fertilitySource = user_soil_test)
  else farmer override    → use it   (user_override)
  else SRDI district default → use it (srdi_default) AND state the assumption
                               in output + offer override
```

Texture is a **separate** input: it feeds `soilFit` in ranking and irrigation advice.

---

## 2. Live weather grounding (T0-2 · A1 tool use)

Three tools, all Open-Meteo, free/keyless. Responses persist to `WeatherSnapshot` and every call
emits an `AgentToolCall` trace row.

```ts
geocodeLocation(text): { lat, lon, matchedName, admin1, sourceUrl, retrievedAt }
// GET geocoding-api.open-meteo.com/v1/search?name=Kushtia&count=5

getForecast(lat, lon): {
  daily: { date, rainMm, tminC, tmaxC }[];      // up to 16 days
  totalRainNext7Mm; totalRainNext16Mm; tmeanNext7C; sourceUrl; retrievedAt;
}
// GET api.open-meteo.com/v1/forecast?daily=precipitation_sum,temperature_2m_max,temperature_2m_min

getClimateNormals(lat, lon, months): {
  monthly: { month, avgRainMm, avgTminC, avgTmaxC }[];
  yearsUsed: "2016–2025"; sourceUrl; retrievedAt;
}
// GET archive-api.open-meteo.com/v1/archive?start_date=…&end_date=…  → average by month IN CODE
```

### Honesty policy (state in UI + README)

- Real forecast covers ~16 days. **Season-scale numbers come from historical normals (a real
  archive API call), not a forecast.** Label every figure `forecast (next N days)` or
  `historical normal (2016–2025)`. Never present normals as forecast.

### Failure policy (hard rule)

```
Weather call fails → log the failed AgentToolCall (status=error) → retry once →
still failing → tell the farmer: "I can't reach the weather service; I can continue
with historical normals only / or wait." NEVER invent rainfall or temp.
```

Cache last successful response per location (`WeatherSnapshot` + in-memory) with `retrievedAt`
so a flaky venue network can't kill the demo.

---

## 3. Deterministic crop ranking (T0-3 · A1)

The LLM must **not** "recall" a ranking. Score in code; the LLM only narrates.

```ts
rankCrops(profile, forecast, normals, candidates): RankedCrop[]
interface RankedCrop {
  cropId; score; subscores; reasons; waterNeedMm; riskLevel;
  expectedYieldT; roughProfitBdt; sources;
}
```

Transparent weights (constants in ONE place, shown in trace):

```
score = 0.25*seasonFit + 0.20*waterFit + 0.15*soilFit
      + 0.15*weatherFit + 0.15*profitPotential + 0.10*budgetFit
```

- **seasonFit** — target season within the crop's calendar window (crop_calendar row).
- **waterFit** — crop water need vs (seasonal-normal rainfall + irrigation implied by `waterAvailability`).
- **soilFit** — hand-made texture-suitability matrix per crop (from KB text; cite it).
- **weatherFit** — near-term forecast vs the immediate operation (heavy rain in sowing window
  penalizes crops needing dry land prep now) + temp-range check.
- **profitPotential** — quick `computeFinancials()` at default yield/current price, normalized.
- **budgetFit** — estimated cost ≤ budget with margin; `riskLevel` from variety/KB notes.

Rank **only crops that exist in the KB**. If <3 fit the season, say so honestly and show nearest
alternatives — that **is** correct Tier 0 behavior (missing-info handling), not a failure.

---

## 4. Season-plan generator (T0-4)

Writes a `SeasonPlan` + ordered `SeasonPlanItem[]`.

```ts
generateSeasonPlan(cropId, areaHa, anchorDate, calendarRow,
                   fertRec, waterRow, forecast): SeasonTask[]
interface SeasonTask {
  windowStart; windowEnd; stage; action;
  inputs: { item; qtyForArea }[]; source; weatherNote?;
}
```

**Date policy** (BARC calendars give month windows, not dates):

```
anchorDate := farmer-given sowing/transplant date
           else midpoint of the valid local window
           → shown as an explicit, EDITABLE assumption:
"Assumption: transplanting set to 05 Aug, midpoint of the BARC Aman window. Change it?"
```

Required stages: land prep · seed/seedling prep · sowing/transplanting · basal fertilizer ·
urea top-dress splits (timings from the FRG row, **not** hardcoded) · irrigation checkpoints
(water_row critical stages × waterAvailability) · weeding rounds · pest/disease scouting
(stage-based, text from KB Layer B) · harvest window.

**Weather-note hook:** if forecast shows ≥40 mm rain within ~2 days of a fertilizer task inside
the 16-day window → attach "≥40 mm rain forecast — consider delaying to cut runoff loss."
(Tier 0 polish now; becomes the Tier 1 proactive-alert feature later.)

---

## 5. Financial model (T0-5)

One **pure function**. No LLM arithmetic anywhere. Persists to `SeasonPlan` money fields.

```ts
computeFinancials(input): FinancialResult
// input: cropId, areaHa, yieldTPerHa, priceBdtPerKg, fertProductsKg,
//        inputPrices, irrigationCount, laborDays, machineryCost
interface FinancialResult {
  costs: { seed, urea, tsp, mop, gypsum, zinc, landPrep, irrigation,
           labor, pesticide, harvest, transport, other };
  totalCostBdt;
  expectedYieldKg;      // yieldTPerHa * 1000 * areaHa
  grossRevenueBdt;      // expectedYieldKg * priceBdtPerKg
  netProfitBdt;         // gross - total
  roiPercent;           // net / total * 100
  breakEvenPriceBdtPerKg;   // total / expectedYieldKg
  breakEvenYieldKg;         // total / priceBdtPerKg
}
```

**Price-unit normalization** (silent-error magnet — normalize everything to BDT/kg at load,
keyed off DAM's own unit column):

```ts
function normalizePricePerKg(price: number, unit: Unit): number {
  return { kg: price, maund: price / 37.3242,  // BD maund = 40 seer ≈ 37.32 kg
           quintal: price / 100, ton: price / 1000 }[unit];
}
```

Yield comes from the chosen variety's `varieties.csv` row (cite it). Every input-price row
carries `source, date, unit, dataOrigin`. Persist both break-even values on `SeasonPlan`:
`breakEvenPriceBdtPerKg` and `breakEvenYieldKg` (current schema has only yield; patch it).

**Freebie:** because it is pure, Tier 1 `simulate(changes)` is a re-call with modified inputs +
a diff of the two outputs.

---

## 6. Trace schema & number provenance (T0-8)

Wrap every tool in a decorator that writes one `AgentToolCall` row (already in schema):

```json
{ "toolName": "getForecast",
  "parameters": { "lat": 23.9, "lon": 89.12 },
  "rawResponse": { "totalRainNext7Mm": 42.3, "tmeanNext7C": 30.1 },
  "purpose": "crop_ranking.weatherFit | season_plan.weatherNotes",
  "status": "success", "startedAt": "…", "finishedAt": "…" }
```

UI: an expandable panel grouped by stage — intake fields · geocode · forecast · normals · soil ·
fertilizer · calendar · variety · price · mem0 RAG hits (snippet + source metadata) · financial in/out.
`WeatherSnapshot.snapshotType` must distinguish `forecast` vs `historical_normal` rows; geocode
and failed calls are trace rows only unless a successful weather payload exists.

**Number provenance:** attach the trace row id to every number the renderer prints (a small
source chip / `[weather_001]` ref). Minimum viable = the raw grouped JSON log; chips are polish.

---

## 7. Data patches inherited from the KB plan (original §10)

1. **Normalized crop IDs, not names:** `rice_t_aman`, `rice_boro`, `wheat`, `maize`, `potato`,
   `mustard`, `lentil`, `onion`. Keep an alias table incl. Bangla
   (`rice_t_aman: ["T. Aman","Transplanted Aman","রোপা আমন"]`).
2. **Standard source columns on every CSV row / mem0 chunk:** `sourceName, sourceUrl, sourceDoc,
   page, retrievedDate, dataOrigin(real|manual|mock), verificationStatus`. CSV rows carry them as
   columns; RAG chunks carry them in the mem0 memory's `metadata` (passed on `mem0Client.add`)
   so `search` returns them for citation.
3. **Mock isolation:** nothing on the Tier 0 path may read a `dataOrigin=mock` row. Mock allowed
   only for Tier 2 price *history*. Enforce with one loader filter + a test.
4. **Retrieval smoke set:** ~6 query→expected-chunk pairs run once after ingestion.
5. **Transcription audit trail:** FRG page screenshots in `data/raw/`, page number on every row.
6. **Season from system date** in the app.

---

## 8. Acceptance (maps to PRD Tier 0 rows)

| Ref | Done when |
|-----|-----------|
| T0-1 | Vague opener → all 6 fields collected asking only gaps; summary read-back; profile persisted. |
| T0-2 | Real lat/lon → real Open-Meteo numbers in answer + trace; failure never invents data. |
| T0-3 | ≥3 ranked crops, deterministic score + subscores + reasons + sources. |
| T0-4 | Dated calendar land-prep→harvest with editable anchor-date assumption. |
| T0-5 | Itemized costs, yield, revenue, profit, ROI, break-even from the pure engine; unit-tested. |
| T0-6 | Code-generated "Recommendation basis" block cites farm inputs + weather + KB. |
| T0-8 | Every number in the final answer maps to ≥1 `AgentToolCall` trace row. |
