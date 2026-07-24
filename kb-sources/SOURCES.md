# KB Sources — provenance registry

> Every KB artifact (CSV row, prose chunk) must trace to a row here. `data_origin=manual` means a
> team member transcribed/curated facts from the source; page numbers must be filled from the
> actual document before judging. Retrieved dates are when we accessed the source.

| # | Source | Publisher | URL | What we take | Access method (R&D-verified) | Retrieved |
|---|--------|-----------|-----|--------------|------------------------------|-----------|
| 1 | Fertilizer Recommendation Guide 2018 (FRG-2018) | BARC | https://barc.gov.bd | Fertilizer doses by crop × soil fertility; urea split timings | PDF download, manual transcription (no API) | 2026-07-24 |
| 2 | Rice Knowledge Bank | BRRI | http://knowledgebank-brri.org / https://brri.gov.bd | Rice varieties, pest/disease management prose (Aman/Boro) | HTML pages, manual curation (no API) | 2026-07-24 |
| 3 | Crop production guides | BARI | https://bari.gov.bd | Wheat, maize, potato, mustard, lentil, onion practices + varieties | PDF/HTML, manual curation (no API) | 2026-07-24 |
| 4 | Crop calendars & extension advice | DAE | https://dae.gov.bd | Season windows, sowing/transplant calendars | PDF/HTML, manual curation (no API) | 2026-07-24 |
| 5 | Upazila Land & Soil Resource Use Guides | SRDI | http://srdi.gov.bd | District/upazila default soil fertility class | PDF/maps, manual transcription (no API) | 2026-07-24 |
| 6 | Crop water information (FAO-56 Kc framework) | FAO | https://www.fao.org/land-water/databases-and-software/crop-information | Seasonal crop water need (mm), critical stages | Web tables, manual transcription (no API) | 2026-07-24 |
| 7 | Bangladesh — Food Prices (WFP) | WFP via HDX | https://data.humdata.org/dataset/wfp-food-prices-for-bangladesh | Hub price baseline: monthly retail/wholesale BDT by market/district, 1998→2026 | **CKAN `package_show` + bulk CSV download** (`wfp_food_prices_bgd.csv`, `wfp_markets_bgd.csv`; `datastore_active=false`, follow 302→S3, send a User-Agent) — automated in `src/kb/ingest/wfpPrices.ts` | 2026-07-24 |
| 8 | Daily market price report | DAM | https://market.dam.gov.bd (fixed PDF: `/global/custom_files/daily_price_report.pdf`) | Optional daily freshness overlay (declared manual supplement; no JSON API; portal scrape-hostile) | Manual/tenant entry only — never the sole price path | 2026-07-24 |
| 9 | Fertilizer Recommendation Guide 2024 | BARC | https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf | Current nutrient recommendations and application timing for all 8 crops; supersedes FRG-2018 values for new ingestion | Official PDF, manually transcribed from printed pages 72–107; raw PDF retained under `raw/` | 2026-07-24 |

## Layout

```
kb-sources/
  SOURCES.md        # this file
  raw/              # original downloads (PDF/HTML) — audit trail, add page screenshots here
  prose/            # curated, self-authored summary docs (data_origin=manual) ready for
                    # `scripts/kb-ingest.ts` — each file header names source + docKey
```

## Ingestion commands (once mem0 is up)

```bash
# hub prose (one per file in prose/):
npx tsx scripts/kb-ingest.ts --file kb-sources/prose/rice_t_aman.md \
  --scope hub --docKey brri:rice_t_aman:practice --docType practice \
  --crop rice_t_aman --source "BRRI Rice Knowledge Bank (curated)" --url http://knowledgebank-brri.org

# hub price baseline (real WFP pull):
npx tsx scripts/kb-refresh-prices.ts --since 2024-01-01
```
