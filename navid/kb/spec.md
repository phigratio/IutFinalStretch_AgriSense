# navid/kb/spec.md — Multi-Tenant Knowledge Base (WHAT)

> Scope: the AgriSense knowledge base as a **multi-tenant system** — a central **shared hub**
> plus a **per-tenant KB** (a district office / NGO / cooperative) that can extend and override
> the hub. The **price subsystem is the critical, live-data part** and is specified in most
> detail. Companion to `docs/PROBLEM_STATEMENT.md` (Tier 0 #7 KB+RAG) and the Tier 0 agent docs
> in `navid/spec.md`.
>
> **Owner:** navid · **Placed in `navid/kb/`** so it does not clobber the Tier 0 `navid/spec.md`.

---

## 0. Why multi-tenant

Agronomic truth is *mostly* national but **prices, varieties in favour, local advisories, dealers,
and pest outbreaks are local**. A single global KB either goes stale or gets generic. So:

- **Shared Hub KB** — curated national knowledge (FRG-2018 doses, BRRI/BARI/DAE guides, FAO
  crop-water, a national price baseline from WFP). Read-only to tenants; maintained centrally.
- **Tenant KB** — each tenant owns a namespace it can write: **local prices** (their bazaar),
  local variety picks, local advisories/alerts, supplier/dealer lists. Scoped to the tenant's
  jurisdiction (one or more districts/upazilas).
- **Resolution rule (everywhere): tenant overrides hub.** A farmer in tenant *T*'s district gets
  *T*'s knowledge layered on top of the hub; on conflict the tenant's (fresher, local) entry wins.

```
Farmer (district=Kushtia)
  → resolve tenant  (Kushtia district office)
  → KB query = search(tenant:Kushtia) ⊕ search(hub)   [tenant precedence]
  → grounded answer + citation that names hub-vs-tenant + source + date
```

---

## 1. Tenancy model

| Concept | Definition |
|--------|-----------|
| **Tenant** | An organization with a **jurisdiction** = a set of districts/upazilas. Demo: 1 tenant ≈ 1 district, but the model allows many. Has a stable `tenantId` (e.g. `dist-kushtia`). |
| **Hub** | The reserved global tenant `hub`. Its KB is the national baseline. Only hub admins write it. |
| **Roles** | `hub_admin` (writes hub), `tenant_admin` (writes own tenant), `agent` (read-only, on behalf of a farmer), `farmer` (never writes KB). |
| **Farmer → tenant** | A farmer's `district` resolves to the tenant whose jurisdiction contains it; if none, they fall back to **hub-only** (still fully functional). |

**Isolation guarantee:** a tenant can read `hub` + its own namespace, and can write **only** its
own. No tenant can read or write another tenant's KB.

---

## 2. Two stores, both tenant-scoped

The KB is **not** one thing — numbers and prose have different query shapes:

| Store | Holds | Query shape | Backend | Tenancy |
|-------|-------|-------------|---------|---------|
| **Structured KB** | prices, fertilizer doses, crop calendars, water needs, variety yields, SRDI fertility, suppliers | **exact match** by (cropId, district, date, …) | **Postgres** (Prisma) | `tenantId` column + `hub` sentinel; resolver prefers tenant row |
| **Vector KB** | prose: practices, pest/disease management, advisories, "why" | **semantic** retrieval + citation | **mem0** (Neo4j + pgvector) | mem0 namespace per tenant + `hub`; two-search-merge |

> **Prices live in the Structured KB, not the vector KB.** They are numeric, queried by
> (crop, district, month), and feed the deterministic finance engine — semantic search is wrong
> for them. mem0 holds the *prose* around agronomy, not the price numbers.

---

## 3. Sources & the API each exposes (R&D)

Verified during R&D (2026-07-24). "API" = how we actually get the data.

### 3.1 Weather (grounding, already built) — real API ✅

| Source | API | Notes |
|--------|-----|-------|
| **Open-Meteo** | JSON REST, keyless: `/v1/forecast` (16-day), `/v1/archive` (normals), `geocoding-api` | Already integrated in `src/tools/weather.ts`. Not KB prose — live grounding. |

### 3.2 Prices — THE CRITICAL SUBSYSTEM (see §4)

| Source | API surface (as verified) | Verdict |
|--------|---------------------------|---------|
| **WFP / HDX "Bangladesh - Food Prices"** | HDX **CKAN** `package_show` (metadata) + **stable CSV download** (`wfp_food_prices_bgd.csv`, `wfp_markets_bgd.csv`). `datastore_active = false` → **no row-query API; bulk CSV only.** Updated ~monthly (`data_update_frequency=30`). | **Primary.** Real, historical (1998→2026), district-level, BDT, retail+wholesale. |
| **DAM** (`market.dam.gov.bd`) | Portal HTML + fixed **daily PDF** (`/global/custom_files/daily_price_report.pdf`) + Bangla graphical report. **No public JSON API found.** Cloudflare/portal is scrape-hostile. | **Supplement, declared.** Manual/mock for *daily* freshness only; brittle — never on the critical path alone. |
| **FAO GIEWS FPMA** | Dashboard + bulletin PDFs. No simple public API. | **Reference only** (cross-check). |
| **TCB** (Trading Corp. of Bangladesh) | Daily essentials retail, HTML/PDF (Dhaka). | Optional supplement. |

### 3.3 Agronomy prose & tables — no APIs, ingest-only 📄

| Source | Form | Use |
|--------|------|-----|
| **FRG-2018** (BARC Fertilizer Recommendation Guide) | PDF, dense tables | Doses → Structured KB (manual transcription + page cite); intro prose → Vector KB |
| **BRRI Rice Knowledge Bank** | Web pages (HTML) | Rice pest/disease prose → Vector KB (best RAG payload); varieties/yield → Structured |
| **BARI / DAE crop guides** | PDF/web | Practices, varieties, calendars → both stores |
| **SRDI** (upazila nutrient status) | PDF/maps | District fertility class → Structured KB |
| **FAO crop-water (Kc / FAO-56, AQUASTAT)** | Tables/PDF (AQUASTAT has an API but Kc is doc-based) | Water need + critical stages → Structured KB |

**None of the agronomy sources expose a usable live API** → they are **ingest-once** (download →
chunk → mem0 for prose; transcribe → CSV/Postgres for numbers), carrying `source, page,
data_origin=manual`.

### 3.4 mem0 tenancy capability (R&D)

mem0 scopes memories by `user_id` / `agent_id` / `run_id` and supports **metadata filters** with
`in, gte, lte, gt, lt, contains, icontains, ne` and AND/OR/NOT. **Caveat found:** open issues
report the v2 `agent_id` filter being flaky. → We **do not rely on a single filtered search**;
we run **two searches (tenant + hub) and merge in code** (§5), and tag every chunk with explicit
metadata `{scope, tenantId, district, docType, cropId, source, page}`.

---

## 4. Price subsystem (critical) — spec

Prices drive `profitPotential` in ranking and every finance number, so they get the most care.

### 4.1 Data model (Structured KB)

A **price observation** is the unit of truth:

```
PriceObservation {
  tenantId        // "hub" for the national baseline, or a tenant id
  cropId          // canonical (rice_t_aman, potato, …) via alias mapping
  commodityLabel  // raw source label ("Rice (coarse)")
  district        // admin2 from WFP, or tenant-declared
  market          // "Dhaka", "Kushtia Sadar", …
  lat, lon        // from WFP markets.csv
  price           // as-reported
  unit            // kg | maund | quintal | ...  -> normalized to BDT/kg on read
  priceType       // retail | wholesale
  currency        // BDT
  observedAt      // the price date (WFP is monthly; tenant may post daily)
  source          // WFP/HDX | DAM | tenant:<id>
  dataOrigin      // real | manual | mock
  verification    // verified | cross_checked | unverified
}
```

### 4.2 Ingestion — WFP hub refresh (the real API path)

```
POST /api/hub/prices/refresh   (hub_admin)
  → GET CKAN package_show(id=wfp-food-prices-for-bangladesh)   // resource ids + freshness
  → download wfp_food_prices_bgd.csv  (follow 302 → signed S3)  // bulk CSV, monthly
  → download wfp_markets_bgd.csv                                // market_id → district, lat/lon
  → filter to our 8 crops (commodity → cropId alias map)
  → upsert PriceObservation(tenantId="hub", source="WFP/HDX", dataOrigin="real")
  → record ingestion run (rows, date range, retrievedAt) in the trace
```

WFP is **monthly + a few months lagged**, so it is a *baseline*, not a spot price — the resolver
and UI must label it as "WFP monthly, <month>", never "today's price".

### 4.3 Tenant price entry (freshness beats the hub)

```
POST /api/tenants/:tid/prices   (tenant_admin)
  body: { cropId, district, market, price, unit, priceType, observedAt }
  → upsert PriceObservation(tenantId=:tid, source="tenant:<id>", dataOrigin="manual")
```

A district office posting today's Kushtia bazaar price gives a fresher, local number than WFP.

### 4.4 Resolution (what the finance engine reads)

```
resolvePrice(cropId, district, asOf=today):
  candidates = PriceObservation where cropId matches AND dataOrigin != mock
  prefer, in order:
    1. tenant row for this district, most recent observedAt      (local + fresh)
    2. hub row for this district (WFP same admin2)               (real, local)
    3. hub row for nearest market (by lat/lon) / national median (real, approximate)
  → normalize to BDT/kg (normalizePricePerKg)
  → return { pricePerKg, provenance: {source, market, observedAt, tenantId, dataOrigin} }
```

Every resolved price carries **provenance** so the basis block and trace can cite exactly which
tenant/hub row and date produced the revenue number. **Never invent a price;** if no non-mock row
exists for a crop, the agent says so and the crop is dropped from ranking (missing-info handling).

---

## 5. Vector KB (prose) — tenancy & retrieval

### 5.1 Namespacing in mem0

Each chunk is added with a stable identity + rich metadata:

```
mem0.add(text, user_id=<owner>, agent_id="agrisense-kb",
         metadata={ scope: "hub" | "tenant", tenantId, district?, docType,
                    cropId?, season?, source, sourceUrl, page, dataOrigin })
```

- **Hub chunks:** `scope="hub"`, no tenantId.
- **Tenant chunks:** `scope="tenant"`, `tenantId=<id>`.

### 5.2 Retrieval merge (two-search, tenant precedence)

Because filtered single-search is unreliable (§3.4), retrieval runs two scoped searches and merges
in code:

```
searchKB(query, tenantId, cropId?):
  hub    = mem0.search(query, filters={scope:"hub"}, limit=k)
  tenant = tenantId ? mem0.search(query, filters={scope:"tenant", tenantId}, limit=k) : []
  merge:
    - tenant chunks get a small relevance boost (local wins ties)
    - dedupe by (docKey) — a tenant chunk with the same docKey OVERRIDES the hub one
    - return top-k with citations [KB:source p.page] (+ "(local: <tenant>)" when tenant)
```

Result: the agent's prose advice is grounded in retrieved chunks, and citations make hub-vs-tenant
and source+page explicit (Tier 0 #6/#7/#8).

---

## 6. KB service API surface (what OUR system exposes)

Agent-facing (read) and admin-facing (write). All tenant-scoped routes enforce role + jurisdiction.

**Retrieval (agent / read):**
- `GET  /api/kb/search?tenantId=&query=&cropId=` → merged prose hits + citations
- `GET  /api/kb/prices?cropId=&district=&asOf=` → resolved price + provenance
- `GET  /api/kb/tables/:kind?cropId=&district=` → resolved structured row (doses/calendar/water/yield)

**Tenant admin (write own KB):**
- `POST /api/tenants` · `GET /api/tenants/:id`
- `POST/PUT/DELETE /api/tenants/:tid/kb/docs` → prose chunks into tenant mem0 namespace
- `POST/PUT /api/tenants/:tid/prices` → local price observations
- `POST/PUT /api/tenants/:tid/tables/:kind` → local overrides (doses/varieties/…)

**Hub admin:**
- `POST /api/hub/prices/refresh` → pull latest WFP CSV → upsert hub prices
- `POST /api/hub/kb/ingest` → chunk a source doc into the hub namespace
- `POST /api/hub/tables/import` → import FRG/BRRI/… tables

**Provenance:** every read returns `dataOrigin`, `source`, `observedAt/retrievedAt`, and
`tenantId|hub` so the agent trace can prove where each number came from.

---

## 7. Honesty & provenance (rubric + submission)

- Every structured row and every prose chunk carries `source, sourceUrl, page, retrieved_date,
  data_origin(real|manual|mock), verification_status`.
- **Mock isolation stays:** nothing on the Tier 0 path reads `data_origin=mock` (WFP is `real`,
  transcribed agronomy is `manual`, only optional price *history* demos may be `mock`).
- Tenant-authored entries are attributed to the tenant in citations, so a judge (or a farmer) can
  see "this local price came from Kushtia district office, 24 Jul" vs "WFP national, May".

---

## 8. Acceptance criteria

| Ref | Done when |
|-----|-----------|
| KB-1 | A tenant can be created with a jurisdiction; a farmer's district resolves to it (or hub). |
| KB-2 | `/api/hub/prices/refresh` pulls the real WFP CSV and upserts hub `PriceObservation` rows for the 8 crops with correct district/lat-lon and provenance. |
| KB-3 | A tenant can POST a local price; `resolvePrice` returns the tenant row (fresher) over the hub row, with provenance. |
| KB-4 | Prose search merges hub + tenant with tenant precedence and returns source+page citations. |
| KB-5 | No Tier 0 read ever returns a `data_origin=mock` row; enforced by a filter + test. |
| KB-6 | A tenant cannot read/write another tenant's KB (isolation test). |
| KB-7 | Every price/table the finance engine uses resolves to a provenance record visible in the trace. |
