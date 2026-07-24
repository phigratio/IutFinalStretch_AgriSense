# navid/kb/plan.md — Implementation Plan (HOW)

> How `navid/kb/spec.md` lands in **this** repo (TypeScript / Express 5 / Prisma 7 / Postgres +
> pgvector / mem0). Read the spec first for the WHAT, `navid/kb/task.md` after for the checklist.

---

## 0. Ground truth

- Stack per the merged repo: `src/` Express app, Prisma/Postgres, mem0 (`src/rag/mem0Client.ts`
  → `mem0-api` + Neo4j + pgvector), OpenAI for chat only.
- Existing structured tables live as CSV in `src/data/` (Tier 0). This plan **promotes the
  tenant-scoped parts (prices, overrides) into Postgres** while keeping the static national
  agronomy tables as hub CSV seed.
- Two parallel agent implementations currently coexist (`src/agent`+engines vs `src/agrisense`) —
  the KB service is **implementation-agnostic**: it exposes resolver functions both can call.

---

## 1. Data model (Prisma additions)

New models (migration `add_multitenant_kb`). `hub` is a reserved `tenantId` sentinel.

```prisma
model Tenant {
  id           String   @id @default(uuid()) @db.Uuid
  slug         String   @unique            // "dist-kushtia", "hub"
  name         String
  kind         String   @default("district") // district | ngo | coop | hub
  createdAt    DateTime @default(now())
  jurisdictions TenantJurisdiction[]
  members      TenantMember[]
  @@map("tenants")
}

model TenantJurisdiction {           // which districts/upazilas a tenant covers
  id        String @id @default(uuid()) @db.Uuid
  tenantId  String @map("tenant_id") @db.Uuid
  tenant    Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  district  String
  upazila   String?
  @@unique([tenantId, district, upazila])
  @@index([district])
  @@map("tenant_jurisdictions")
}

model TenantMember {                 // role binding (reuses AppUser)
  id       String @id @default(uuid()) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  userId   String @map("user_id") @db.Uuid
  role     String                    // hub_admin | tenant_admin
  @@unique([tenantId, userId])
  @@map("tenant_members")
}

model PriceObservation {             // the critical structured price unit (spec §4.1)
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @map("tenant_id")          // "hub" or a tenant slug/id
  cropId        String   @map("crop_id")
  commodityLabel String? @map("commodity_label")
  district      String?
  market        String?
  latitude      Decimal? @db.Decimal(9,6)
  longitude     Decimal? @db.Decimal(9,6)
  price         Decimal  @db.Decimal(12,4)
  unit          String                              // kg|maund|quintal|ton
  priceType     String   @map("price_type")         // retail|wholesale
  currency      String   @default("BDT")
  observedAt    DateTime @map("observed_at") @db.Date
  source        String                              // WFP/HDX | DAM | tenant:<id>
  sourceUrl     String?  @map("source_url")
  dataOrigin    String   @map("data_origin")        // real|manual|mock
  verification  String   @default("unverified")
  createdAt     DateTime @default(now())
  @@index([cropId, district, observedAt])
  @@index([tenantId])
  @@map("price_observations")
}

model KbTableOverride {              // tenant overrides for doses/varieties/calendar/water
  id        String @id @default(uuid()) @db.Uuid
  tenantId  String @map("tenant_id")
  kind      String                    // fertilizer|calendar|water|variety|srdi
  cropId    String @map("crop_id")
  district  String?
  payload   Json                      // the row (same shape as the CSV row)
  source    String
  dataOrigin String @map("data_origin")
  updatedAt DateTime @updatedAt
  @@index([kind, cropId, district])
  @@map("kb_table_overrides")
}

model KbDocument {                   // registry of prose docs pushed to mem0 (for admin/audit)
  id        String @id @default(uuid()) @db.Uuid
  tenantId  String @map("tenant_id")  // "hub" or tenant
  scope     String                    // hub|tenant
  docKey    String @map("doc_key")    // stable id for override/dedupe (e.g. "frg2018:urea:aman")
  title     String
  source    String
  sourceUrl String? @map("source_url")
  page      String?
  cropId    String? @map("crop_id")
  mem0Ids   String[] @default([]) @map("mem0_ids")  // ids returned by mem0.add
  dataOrigin String @map("data_origin")
  createdAt DateTime @default(now())
  @@unique([tenantId, docKey])
  @@index([scope])
  @@map("kb_documents")
}
```

`PriceObservation.tenantId` is a plain string (`"hub"` sentinel) rather than a FK so the hub row
needs no Tenant row and seeding stays trivial.

---

## 2. Repo layout

```
src/
  kb/
    tenancy.ts          # resolveTenantForDistrict(), assertTenantAccess(), jurisdictions
    priceStore.ts       # upsert + resolvePrice() (tenant>hub>nearest), normalizePricePerKg reuse
    tableStore.ts       # resolveTable(kind, cropId, district) with tenant override then CSV hub
    vectorKb.ts         # searchKB() two-search-merge over mem0Client; addChunk() with metadata
    ingest/
      wfpPrices.ts      # CKAN package_show + CSV download + crop/commodity map -> PriceObservation
      wfpMarkets.ts     # market_id -> district/lat/lon lookup
      chunkDoc.ts       # PDF/HTML text -> ~500-tok chunks -> mem0 (hub or tenant)
      commodityMap.ts   # WFP commodity -> canonical cropId + unit
  routes/
    kb.ts               # GET /api/kb/search|prices|tables (agent read)
    tenants.ts          # tenant CRUD + /prices + /kb/docs + /tables (tenant_admin)
    hub.ts              # /api/hub/prices/refresh, /kb/ingest, /tables/import (hub_admin)
  data/                 # stays: national hub CSV seed (fallback when no Postgres row)
scripts/
  kb-refresh-prices.ts  # CLI wrapper over ingest/wfpPrices (cron-able)
  kb-ingest.ts          # CLI: ingest a source doc into hub/tenant mem0
tests/ (co-located *.test.ts)
```

Existing `src/data/*.csv` become the **hub fallback**: `resolvePrice`/`resolveTable` read Postgres
first, then fall back to the CSV national baseline. Zero data loss, incremental migration.

---

## 3. The WFP price ingester (critical path)

`src/kb/ingest/wfpPrices.ts` — the only real live price API path (spec §4.2):

1. `GET https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-bangladesh`
   → resource ids + `data_update_frequency`. (Use `fetch` with a UA; HDX blocks empty UA.)
2. Download `wfp_food_prices_bgd.csv` — **follow the 302 to the signed S3 URL** (`redirect:follow`).
3. Download `wfp_markets_bgd.csv` for `market_id → district/lat/lon`.
4. Parse (reuse `src/data/loader.ts` `parseCsv`). Columns:
   `date, admin1, admin2, market, market_id, latitude, longitude, category, commodity,
   commodity_id, unit, priceflag, pricetype, currency, price, usdprice`.
5. Map `commodity → cropId` via `commodityMap.ts`; keep only our 8 crops; keep `priceflag=actual`.
6. Upsert `PriceObservation(tenantId="hub", source="WFP/HDX", dataOrigin="real",
   verification="cross_checked")` keyed by (cropId, market, observedAt, priceType).
7. Emit a trace/ingestion record: rows imported, date range, `retrievedAt`.

**Injectable `fetchFn`** (like `weather.ts`) so tests run offline against a saved CSV fixture.
WFP is monthly + lagged → label everything "WFP monthly <YYYY-MM>", never "today".

---

## 4. Price resolution

`src/kb/priceStore.ts` `resolvePrice(cropId, district, asOf)` (spec §4.4):

```
rows = PriceObservation.findMany({ cropId, dataOrigin != "mock" })   // mock isolation
pick first available:
  1. tenant-of(district) rows, max(observedAt)          // local + fresh
  2. hub rows where district == given, max(observedAt)   // WFP same admin2
  3. hub rows, nearest market by haversine(lat,lon) OR national median
normalize -> BDT/kg (reuse engines/financials.normalizePricePerKg)
return { pricePerKg, provenance }
```

Finance engine and ranking call `resolvePrice` instead of the CSV `getPrice` (behind a small
adapter so the Tier 0 pipeline is unchanged except for the source).

---

## 5. mem0 tenancy (vectorKb.ts)

- `addChunk({scope, tenantId, docKey, ...meta}, text)` → `mem0Client.add` with
  `agent_id="agrisense-kb"`, `user_id = scope==="hub" ? config.mem0KbUserId : "tenant:"+tenantId`,
  and full `metadata`. Record `mem0Ids` in `KbDocument`.
- `searchKB(query, tenantId, cropId?)` → **two searches** (hub filter, tenant filter), merge in
  code with tenant boost + `docKey` dedupe (spec §5.2). Do **not** trust a single `agent_id`
  filter (R&D caveat). If mem0 is down, fall back to structured-only advice + a visible notice.
- Citations: build `[KB:<source> p.<page>]` from chunk metadata; append `(local: <tenant>)` for
  tenant chunks.

---

## 6. Reconciled decisions

- **Prices in Postgres, not mem0, not CSV-only.** Numeric, exact-match, tenant-scoped, needs
  upsert + freshness — a relational table is correct. CSV stays as hub fallback seed.
- **WFP is the primary price source** (real, historical, district-level, stable CSV). DAM is a
  declared manual supplement for daily freshness; never the sole path.
- **Two-search-merge for prose**, not single filtered search (mem0 v2 filter caveat).
- **`hub` is a string sentinel tenantId**, so the national baseline needs no Tenant row.
- **Tenant overrides hub** uniformly: `resolvePrice`, `resolveTable`, `searchKB` all prefer tenant.
- **Reuse, don't fork:** `parseCsv`, `normalizePricePerKg`, the trace decorator, and the mem0
  client are reused — the KB service adds stores + routes, not a new stack.

---

## 7. Test strategy (vitest, offline)

Fixture-driven, no live network/DB where avoidable:
- WFP ingester parses a saved CSV fixture → correct `PriceObservation` rows + crop mapping.
- `resolvePrice` precedence: tenant > hub-same-district > hub-nearest; mock rows excluded.
- Tenant isolation: tenant A cannot resolve/read tenant B's rows.
- `searchKB` merge: tenant chunk with same `docKey` overrides hub; citations carry source+page.
- Unit-normalization: maund/quintal price → BDT/kg (reuse existing test).

DB-touching tests follow the repo's in-memory-store pattern (a `PriceStore` interface with an
in-memory impl for tests, Postgres impl in the app), mirroring `InMemoryAuthStore`.

---

## 8. Definition of done (navid's KB slice)

`npm run typecheck` + `npm test` green · `kb-refresh-prices` pulls real WFP rows for the 8 crops ·
`resolvePrice` returns tenant-over-hub with provenance · `searchKB` merges hub+tenant with
citations · mock rows never surface on the Tier 0 path · tenant isolation holds.
