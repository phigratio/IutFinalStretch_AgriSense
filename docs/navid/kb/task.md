# navid/kb/task.md — Multi-Tenant KB Checklist

> From `navid/kb/spec.md` (WHAT) + `navid/kb/plan.md` (HOW).
> **Must = the KB + price path lives or dies here. Nice = after the core resolves cleanly.**
> Keep `npm run typecheck` + `npm test` green throughout. `[x]` as you land each.

---

## Phase K0 — Schema & tenancy foundation

- [ ] **K0-1. Migration `add_multitenant_kb`** — `Tenant`, `TenantJurisdiction`, `TenantMember`,
  `PriceObservation`, `KbTableOverride`, `KbDocument` (plan.md §1) + `prisma generate`. `[Must]`
- [ ] **K0-2. Tenancy resolver** — `src/kb/tenancy.ts`: `resolveTenantForDistrict(district)`
  (→ tenant or `hub`), `assertTenantAccess(user, tenantId, role)`. Test. `[Must]`
- [ ] **K0-3. Seed hub + one demo tenant** — `hub` sentinel + `dist-kushtia` covering Kushtia;
  script `scripts/seed-tenants.ts`. `[Must]`

## Phase K1 — Price subsystem (CRITICAL)

- [ ] **K1-1. Commodity→crop map** — `src/kb/ingest/commodityMap.ts`: WFP `commodity`/`unit` →
  canonical `cropId` + unit, for the 8 crops. Test the mapping. `[Must]`
- [ ] **K1-2. WFP markets loader** — `src/kb/ingest/wfpMarkets.ts`: `market_id → {district,
  lat, lon}` from `wfp_markets_bgd.csv` (injectable fetch; fixture test). `[Must]`
- [ ] **K1-3. WFP price ingester** — `src/kb/ingest/wfpPrices.ts`: CKAN `package_show` → CSV
  (follow 302 → S3) → filter 8 crops + `priceflag=actual` → upsert `PriceObservation`
  (tenantId="hub", real). Injectable fetch; fixture test on a saved CSV. `[Must]`
- [ ] **K1-4. `resolvePrice`** — `src/kb/priceStore.ts`: precedence tenant > hub-same-district >
  hub-nearest/median; exclude `dataOrigin=mock`; normalize to BDT/kg; return provenance. Test
  precedence + mock exclusion. `[Must]`
- [ ] **K1-5. Tenant price write** — `POST /api/tenants/:tid/prices` upsert
  (source="tenant:<id>", manual); resolver now prefers it. Test tenant-beats-hub. `[Must]`
- [ ] **K1-6. Hub refresh route + CLI** — `POST /api/hub/prices/refresh` +
  `scripts/kb-refresh-prices.ts`; records retrievedAt + row/date-range in trace. `[Must]`
- [ ] **K1-7. Finance adapter** — point ranking/finance at `resolvePrice` (behind a small
  adapter) instead of CSV `getPrice`; keep Tier 0 tests green. `[Must]`

## Phase K2 — Structured overrides (doses / calendar / water / variety / srdi)

- [ ] **K2-1. `resolveTable(kind, cropId, district)`** — `src/kb/tableStore.ts`: tenant
  `KbTableOverride` → else Postgres hub → else `src/data/*.csv` fallback. Test override + fallback. `[Must]`
- [ ] **K2-2. Tenant table override write** — `POST/PUT /api/tenants/:tid/tables/:kind`. `[Nice]`

## Phase K3 — Vector KB (prose) + tenancy

- [ ] **K3-1. `addChunk`** — `src/kb/vectorKb.ts`: `mem0Client.add` with
  `{scope, tenantId, docKey, docType, cropId, source, page, dataOrigin}`; register in
  `KbDocument`. `[Must]`
- [ ] **K3-2. `searchKB` two-search-merge** — hub + tenant searches, tenant boost, `docKey`
  dedupe/override, citations `[KB:source p.page] (+ local:<tenant>)`; mem0-down fallback. Test
  merge + override + citation shape (mock mem0 client). `[Must]`
- [ ] **K3-3. Doc chunker + ingest CLI** — `src/kb/ingest/chunkDoc.ts` (~500-tok) +
  `scripts/kb-ingest.ts` (hub or tenant). `[Must]`
- [ ] **K3-4. Wire `searchKB` into the agent** — `query_knowledge_base` tool calls it with the
  farmer's resolved tenant; prose advice + citations grounded in retrieval. `[Must]`

## Phase K4 — Service API & isolation

- [ ] **K4-1. Read routes** — `src/routes/kb.ts`: `GET /api/kb/search|prices|tables`
  (tenant-scoped), each returning provenance. Wire into `src/app.ts`. `[Must]`
- [ ] **K4-2. Tenant admin routes** — `src/routes/tenants.ts`: tenant CRUD + `/prices` +
  `/kb/docs` + `/tables`, role + jurisdiction enforced. `[Must]`
- [ ] **K4-3. Hub admin routes** — `src/routes/hub.ts`: `/prices/refresh`, `/kb/ingest`,
  `/tables/import`. `[Must]`
- [ ] **K4-4. Isolation guard** — `assertTenantAccess` on every write + tenant-scoped reads;
  test tenant A cannot read/write tenant B. `[Must]`

## Phase K5 — Sources & honesty

- [ ] **K5-1. `kb-sources/SOURCES.md`** — real URLs + retrieved dates for WFP, FRG-2018, BRRI RKB,
  BARI/DAE, SRDI, FAO crop-water (per spec §3). `[Must]`
- [ ] **K5-2. Ingest hub agronomy** — transcribe FRG doses (page cites), chunk BRRI/BARI prose
  into hub mem0. `[Must]`
- [ ] **K5-3. Provenance + mock isolation test** — every resolved price/table/chunk carries
  `source/dataOrigin/observedAt`; no Tier 0 read returns `mock`. **Rubric line — do not cut.** `[Must]`

## Phase K6 — Nice

- [ ] **K6-1. DAM daily supplement** — parse `daily_price_report.pdf` as a *declared* manual
  freshness overlay (tenant-postable). `[Nice]`
- [ ] **K6-2. Nearest-market interpolation** — haversine nearest WFP market when district absent. `[Nice]`
- [ ] **K6-3. Sell-now/store/wait signal** (Tier 2) — from `PriceObservation` history trend. `[Nice]`
- [ ] **K6-4. Tenant KB admin UI** — simple screen to post prices/docs. `[Nice]`

---

### External source API cheat-sheet (from R&D, for implementers)

| Source | How to get it | Cadence | Notes |
|--------|---------------|---------|-------|
| **WFP/HDX prices** | CKAN `package_show?id=wfp-food-prices-for-bangladesh` → CSV `wfp_food_prices_bgd.csv` (302→S3, follow) + `wfp_markets_bgd.csv` | ~monthly | `datastore_active=false` → **bulk CSV only**, no row-query API. 1998→2026, BDT, admin2=district, retail+wholesale. Send a User-Agent. |
| **Open-Meteo** | JSON REST, keyless (`/forecast`, `/archive`, geocoding) | live | Already integrated (`src/tools/weather.ts`). |
| **DAM** | Portal HTML + `daily_price_report.pdf` | daily | No JSON API; scrape-hostile → manual/declared supplement. |
| **FAO GIEWS FPMA** | Dashboard + bulletin PDFs | — | No simple API → reference/cross-check only. |
| **FRG-2018 / BRRI RKB / BARI / DAE / SRDI / FAO crop-water** | PDF/HTML download | static | No APIs → ingest-once (transcribe numbers, chunk prose), carry page cites. |
| **mem0** | `mem0Client.add/search` (`user_id`/`agent_id` + metadata filters) | — | v2 `agent_id` filter flaky → **two-search-merge**, tag chunks with explicit metadata. |

### Definition of done (KB slice)
`typecheck` + `test` green · WFP refresh pulls real hub prices for 8 crops · `resolvePrice`
tenant-over-hub with provenance · `searchKB` merges hub+tenant with citations · mock never on the
Tier 0 path · tenant isolation holds.
