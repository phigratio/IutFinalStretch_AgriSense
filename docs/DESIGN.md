# DESIGN — AgriSense AI (product, data, prompt & integration design)

> Companion to ARCHITECTURE.md (structure) — this file holds the concrete shapes: screens,
> contracts, prompts, formulas, KB plan, payment UX, demo script.
> **Last updated:** 2026-07-24 ~11:00 (H+2)

---

## 1. Product shape — one screen, chat-first

```
┌────────────────────────────────────────────────────────────────────┐
│ AgriSense 🌾   [Farm: Rahim · Bogura · 2 acres]   [EN|বাং] [⚙flags] │
├───────────────────────────────┬────────────────────────────────────┤
│  CHAT (primary)               │  AGENT TRACE (collapsible)         │
│  farmer ↔ agent bubbles       │  ▸ plan: 4 steps                   │
│  · follow-up chips for gaps   │  ▸ geocode_location {q:"Bogura"}   │
│  · recommendation cards       │    ← {lat:24.85, lon:89.37} 210ms  │
│  · citation chips [KB:…]      │  ▸ get_weather {...}               │
│  ────────────────────────────  │    ← rain[0..6]=2mm… 380ms        │
│  [input…            ] [send]  │  ▸ query_knowledge_base {...}      │
├───────────────────────────────┴────────────────────────────────────┤
│ TABS:  Season Plan 📅 · Finance ৳ · Alerts 🔔 · Market 🛒 · KB 📚   │
└────────────────────────────────────────────────────────────────────┘
```

- Trace panel default **open** during judging. Every trace row expands to raw JSON.
- Recommendation cards: crop name, score bar, water need, risk chip, profit estimate,
  "why → " expands the factor breakdown + citations.
- Season Plan tab: vertical timeline grouped by month; each task: date range, action,
  quantities, cost, status chip (upcoming/due/done); alert badges attach to affected tasks.
- Finance tab: itemized table; editable assumptions (price/yield sliders) → recompute via
  engine live (proves "change an input, outputs change correctly"); scenario compare view.
- Bengali toggle swaps UI labels (tiny i18n map) and instructs the agent to reply in Bangla.

## 2. Core conversation flows

**F1 Intake (T0-1):** vague opener → agent replies with value + the gap list as quick-reply
chips (e.g. buttons: soil types with a "not sure" → agent infers from district + says so).
Profile card fills live as fields land. Gap check is code (`requiredFieldGaps`), not LLM vibes.

**F2 Plan-my-season (T0-2..6):** happy path = geocode → weather → KB → rank_crops →
recommendation cards → farmer picks crop → build_season_plan + compute_financials → tabs
populate → chat summary with citations + "because" sentences.

**F3 What-if (T1-5):** "rainfall drops 30%?" → `simulate_scenario` → compare view (old vs new
yield/net/ROI + changed plan tasks e.g. +2 irrigation events) → agent explains deltas.

**F4 Alert (T1-2):** watcher (or dev simulate button, declared) → alert row + SMS →
chat proactively: "Heavy rain (34mm) expected Sun–Mon. Your urea top-dress was due Sat.
Recommendation: apply by Fri morning or delay to Wed. [why→ forecast + KB nitrogen-runoff]".

**F5 Order & pay (P-1, T2-1):** "order urea for my basal dose" → `list_suppliers` ranked →
cart card → confirm → CaaS: list PI → balance → direct debit → receipt card (trxId, amount,
balance before/after) + SMS confirm; trace shows raw S1000 responses.

**F6 Returning farmer (T1-1):** new session → phone/farm id → "Welcome back Rahim — Boro
day 12 of 145, germination stage. Next: first irrigation in 3 days. 2 alerts since last visit."

## 3. Shared contracts (authoritative field lists — `shared/types.ts`)

```ts
// FarmProfile — the agent's persistent model of one farm (T0-1, memory A4)
{ id, phone?, name?, location: {raw, district?, lat?, lon?},
  areaValue, areaUnit: "acre"|"bigha"|"decimal",     // normalize: 1 acre = 3 bigha (BD)
  soilType: "sandy"|"loam"|"clay"|"sandy-loam"|"clay-loam"|"silt"|null,
  water: "rainfed"|"tubewell"|"canal"|"pond"|"mixed"|null,
  budgetBDT, season: "kharif-1"|"kharif-2"|"rabi"|null,
  experience?, preferences?: string[], createdAt, updatedAt }

// CropRecommendation (T0-3) — output of rank_crops, rendered as cards
{ crop, suitability: 0..100, factors: {soilFit, seasonFit, waterFit, tempFit, budgetFit},
  waterNeedMm, waterNeedClass: "low"|"medium"|"high",
  riskLevel: "low"|"medium"|"high", riskReasons: string[],
  estCostBDT, estRevenueBDT, estProfitBDT, citations: KbRef[] }

// SeasonPlan + PlanTask (T0-4)
{ id, farmId, crop, sowDate, harvestWindow: [start,end], tasks: PlanTask[] }
{ id, planId, phase: "land-prep"|"sowing"|"fertilizer"|"irrigation"|"weed"|"pest-check"|"harvest",
  title, dateStart, dateEnd, details, quantities?: {item, amount, unit}[],
  costBDT?, status: "upcoming"|"due"|"done"|"adjusted", adjustedReason?, citations: KbRef[] }

// FinancialProjection (T0-5) — pure FinanceEngine output
{ inputs: {crop, areaAcre, seedRateKgAcre, fertPlan: {urea,tsp,mop,zinc? kg}, prices: {...},
           laborDays, irrigationCount, pesticideBDT, yieldTonAcre, farmGatePriceBDTkg },
  costItems: {label, qty, unit, unitPriceBDT, totalBDT, source: KbRef|“seeded”}[],
  totalCostBDT, expectedYieldTon, revenueBDT, netProfitBDT, roiPct,
  breakEven: {priceBDTkg, yieldTonAcre} }

// TraceEvent (T0-8) — the judge-facing proof stream
{ id, sessionId, turnId, seq, kind: "plan"|"tool"|"llm"|"error",
  tool?, argsJson?, resultJson?, latencyMs?, ts, provider? }

// ChatEvent (SSE union): {type:"token",text} | {type:"plan",steps[]} | {type:"trace",event}
// | {type:"profile",patch} | {type:"card",card} | {type:"alert",alert} | {type:"done",turnId}

// Alert (T1-2): { id, farmId, ruleId, severity, message, forecastBasis: {date, valueMm|valueC},
//   affectedTaskId?, smsSent: bool, createdAt }
// Order/PaymentResult (P-1): { orderId, items[], totalBDT } /
//   { ok, externalTrxId, internalTrxId?, statusCode, statusDetail, balanceBefore?, raw }
// KbRef: { docId, section, title }   → rendered as chip [KB:barc-frg§rice-n]
```

## 4. Agent prompts (Member A — keep in `server/agent/prompts.ts`, frozen at H+21)

**System prompt skeleton (v1):**
```
You are AgriSense, an agricultural advisor agent for smallholder farmers in Bangladesh.
GOAL: from conversation, produce a costed, weather-aware season plan and keep advising.
HARD RULES:
1. NEVER invent numbers. Every number (weather, dose, cost, date, price) must come from a
   tool result in this conversation. If you lack a number, call a tool or say you don't have it.
2. Missing profile fields for the current request → ask ONLY for those fields, in one short
   message. Never re-ask something present in FARM PROFILE.
3. Before a multi-step task, output a one-line numbered plan of the tools you will use.
4. Every recommendation follows: <action + quantity + date>, because <farm input(s)> +
   <retrieved value(s)> + [KB:doc§sec] citation(s).
5. Keep answers short, concrete, farmer-friendly (bighas, ৳, dates like "Sat 27 Jul").
   No agronomy jargon without a one-word gloss. Reply in Bengali if the user does.
6. Prefer tool data over your own knowledge whenever they conflict.
FARM PROFILE: {json}   SESSION SUMMARY: {text}   TODAY: {date} · District: {…}
```

**Turn discipline:** tool results are appended as role=tool messages; the loop enforces
step budget + dedupe (ARCHITECTURE §4.1). Summary updater prompt (cheap call, post-turn):
"Update this 5-line running summary with any NEW durable facts/decisions: …".

**Adversarial set for P2-A3 (keep as fixture):** "ki lagabo bujhtesi na" · "2 bigha, poor
soil" (unit + vague soil) · "budget nai bollei chole" · "last year potato lost money" (memory
+ preference) · "amar jomi te pani thake na" (water) · contradictions ("actually 5 bigha").

## 5. Knowledge base & RAG (Member B)

**Target sources (public; save to `kb-sources/` + record url/date/license in SOURCES.md):**
1. BARC **Fertilizer Recommendation Guide** (national dose tables by crop × soil) — backbone
   of fertilizer math and citations.
2. BRRI rice knowledge bank / Adhunik Dhaner Chash (varieties, stages, doses for Boro/Aman/Aus).
3. BARI guides for potato, maize, mustard, vegetables.
4. DAE crop calendar (sowing/harvest windows by season) + Krishi Batayon crop pages.
5. FAO crop water needs (Kc values, mm per stage) — irrigation math.
6. DAM (Department of Agricultural Marketing) recent wholesale price bulletin — seeds
   `marketPrices.json` (dated snapshot, declared seeded).
7. One pest/disease management guide (BRRI/BARI/plantwise pages) — pest rule table.

**Two representations, both built during the event:**
- **Chunks for RAG:** markdown-ified sections, ~500 tokens, metadata `{docId, section, crop,
  topic}`, MiniLM vectors in SQLite. Hybrid retrieve = cosine top-20 ∪ keyword-boost → rerank
  by (0.7·cos + 0.3·bm25lite + crop-filter bonus) → top-5 with `KbRef`s.
- **Structured tables for engines** (`server/engines/data/*.ts`): crop table (seasons, soils,
  stage durations, water class, seed rate, baseline yield & costs), BARC dose table, Kc table,
  pest rules. Each row carries a `source: KbRef` so even engine outputs cite documents.

**Retrieval quality gate (P2-B3):** 10 canned questions ("urea split for boro rice", "potato
sowing window rabi", …) must surface the right chunk in top-3.

## 6. Engine formulas (Member B — unit-test these exact behaviors)

- **CropScore:** `suitability = 100 · (0.30·soilFit + 0.25·seasonFit + 0.20·waterFit +
  0.15·tempFit + 0.10·budgetFit)`; each factor ∈ [0,1] from lookup tables; `tempFit` compares
  forecast mean vs crop optimal range; `waterFit` = water source class vs crop water need
  (rainfed + high-need + low forecast rain ⇒ ~0.2); `budgetFit` = budget / estCost clamped.
  Risk = worst factor + weather volatility flag (forecast rain σ). Output includes the factor
  breakdown verbatim (explainability).
- **SeasonPlanner:** `sowDate` from crop season window ∩ next-10-day weather (avoid sowing
  into ≥30mm/3-day forecast); stage boundaries = cumulative stage durations; fertilizer splits
  at stage starts (e.g. rice N: ⅓ basal, ⅓ tillering ~d21, ⅓ panicle ~d45 — per BARC table);
  irrigation events per water class minus forecast-rain skips; pest checks at stage boundaries.
- **FinanceEngine:** `fertCost = Σ(doseKgAcre × area × unitPrice)`; `revenue = yieldTonAcre ×
  area × 1000 × farmGatePriceBDTkg`; `net = revenue − totalCost`; `roi = net/totalCost·100`;
  `breakEvenPrice = totalCost / (yieldTon×1000)`; `breakEvenYield = totalCost / (price×1000×area)`.
  Invariant tests: doubling area scales linearly; +10% price moves net by exactly yield×area×1000×0.1·price.
- **AlertEngine rules (initial set):** R1 rain ≥20mm within 3d of a fertilizer task → delay
  advice; R2 no rain 7d + rainfed + water-critical stage → irrigation warning; R3 temp ≥35°C
  at flowering → heat-stress note; R4 humidity ≥85% & 25–30°C at rice vegetative → blast
  scouting alert. Each alert stores rule id + the forecast numbers that fired it.

## 7. bdapps integration design (Member C — shapes from organizer cheatsheet/DGD)

- Client: base `https://developer.bdapps.com`, JSON POST, every request `{applicationId,
  password, ...}`; success = `statusCode:"S1000"`; msisdn `tel:8801XXXXXXXXX`; masked ids OK.
- **Checkout sequence (F5):** `POST /caas/list/pi` → pick "Mobile Account" → `POST
  /caas/balance/query` (friendly insufficient-balance path if `chargeableBalance` < total) →
  `POST /caas/direct/debit` `{amount, externalTrxId: "AGS-<farmId>-<ts>"}` → persist
  `payments` row with full raw response → receipt card + `POST /sms/send` confirmation.
  Retry only on E1318/E1602/E1603 (retry-able); never reuse `externalTrxId`.
- **SMS:** alerts + receipts; Bengali via `encoding:"16"` when FLAG_BENGALI.
- **Listeners** (`/bdapps/sms|ussd|subscription`): always reply `{"statusCode":"S1000"}`;
  inbound SMS "PLAN"/"ALERT" replies with plan status (nice Q&A flex, low cost via existing tools).
- **Mock mode:** `MOCK_BDAPPS=1` returns cheatsheet-shaped canned responses tagged
  `mock:true` (trace + README declare it). Real sandbox is the demo default.
- Ops notes: venue public IP in Allowed Hosts (E1303!), amounts ৳5–20, test Robi SIM for live
  SMS receipt on stage if available.

## 8. Persistence design (Member C)

SQLite WAL mode; DAOs in `server/db/db.ts`; schema.sql version-stamped; `seed-demo-farm.ts`
creates demo farmer "Rahim, Bogura, 2 acre, sandy-loam, tubewell, ৳40k, boro" + a mid-season
plan for the returning-farmer and alert demos. DB file backed up before judging.

## 9. Visual style (cap effort — RULES §2.5)

Tailwind v4 defaults; green accent `#16a34a`, amber alerts, red risk; Inter/system font;
light mode only; cards `rounded-xl border bg-white shadow-sm`; trace panel monospace 12px.
No component library, no dark mode, no animation beyond CSS transitions.

## 10. The 4-minute demo script (rehearse verbatim; owner C narrates, A drives)

| t | Beat | Proves |
|---|------|--------|
| 0:00–0:20 | "Farmers lose money at settlement because planting decisions are made blind. AgriSense is an agent that plans a season end-to-end." Trace panel visibly open. | framing |
| 0:20–1:10 | Vague opener: *"I have some land in Bogura, what should I plant?"* → agent asks ONLY missing fields (size, soil, water, budget, season) via chips; profile card fills. | A3 intake |
| 1:10–2:10 | Agent plans visibly (step list) → real geocode + forecast in trace → 3 crop cards with scores/risk/profit → open "why": factors + [KB:…] chips. *Point at the raw forecast JSON matching the numbers in the answer.* | A1 A2 A5, T0-2/3, RAG |
| 2:10–2:50 | Pick Boro rice → dated season calendar + finance tab; tweak price slider → net/ROI/break-even recompute live. *"What if rainfall drops 30%?"* → compare view. | T0-4/5, T1-5 |
| 2:50–3:30 | *"Order urea for the basal dose."* → suppliers → checkout → **real bdapps sandbox debit S1000 on screen in trace** → receipt + SMS shown on phone. | P-1, T2-1 |
| 3:30–4:00 | Simulate forecast change (say "simulated") → proactive alert + SMS: "delay top-dress 4 days". Reload as returning farmer → greeted with plan status. Close: "Everything you saw came from a tool call — here's the full trace." | T1-2, A4/T1-1, T0-8 |

**Q&A crib (memorize):** what's real vs mock (PRD §7 table) · where any number came from
(trace) · why deterministic engines (accuracy + inspectability) · KB sources by name (BARC/
BRRI/BARI/DAE/FAO/DAM) · how memory works (SQLite profile + summaries) · rate-limit plan
(3 keys + failover) · what we'd build next (real DAM feed, voice).
