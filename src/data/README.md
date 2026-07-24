# src/data — agronomy & price tables

Structured tables the deterministic engines read (ranking, finance, season plan).
Prose/RAG lives in mem0, not here.

## Honesty status (read before demo)

Every row carries the standard source columns:
`source_name, source_url, source_doc, page, retrieved_date, data_origin, verification_status`.

- **`data_origin`**: `real` | `manual` | `mock`.
  - `real` — pulled from a live/public dataset (e.g. prices from WFP/HDX).
  - `manual` — a human transcribed it from a cited public doc.
  - `mock` — seeded/fake. **Never read on the Tier 0 path** — the loader filters these out
    (`loadTable(..., { allowMock: false })`, the default). Only Tier 2 price *history* may use mock.
- **`verification_status`**: `verified` | `cross_checked` | `unverified`.

⚠ **The agronomy numbers here are `manual` + `unverified` placeholder baselines** (reasonable
Bangladesh values) so the pipeline runs and tests pass. Before judging, transcribe the real
FRG-2018 / BARC / BRRI / BARI / FAO values, fill the `page` column (currently `TODO`), and flip
`verification_status` to `cross_checked`. Keep page screenshots in `data/raw/`.

## Files

| File | Keyed by | Feeds |
|------|----------|-------|
| `crops.csv` | cropId | master list, risk, default variety |
| `crop_calendar.csv` | cropId, season | seasonFit + season-plan windows/dates |
| `crop_water.csv` | cropId | waterFit + irrigation checkpoints |
| `fertilizer_frg.csv` | cropId, fertilityClass | doses + urea split timings |
| `varieties.csv` | varietyId | yield_t_ha for finance |
| `prices_dam.csv` | cropId | BDT price for revenue/break-even |
| `srdi_fertility.csv` | district | default fertility class when no soil test |
| `crop_aliases.json` | cropId | Bangla/English crop-name resolution |
| `soil_fit_matrix.json` | cropId × texture | soilFit score |
| `pest_disease_rules.csv` | cropId, growth stage, weather thresholds | pest & disease risk assessment |
