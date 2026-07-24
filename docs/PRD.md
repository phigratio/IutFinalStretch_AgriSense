# PRD — AgriSense AI (IUT 12th ICT Fest · bdapps Agentic AI Hackathon, Final Round)

> **Read order for any new session (human or AI):** `MEMORY.md` → this file → `ARCHITECTURE.md` → `PHASES.md` → `DESIGN.md` → `RULES.md`
> **Owner:** whole team · **Last updated:** 2026-07-24 ~10:30 (H+1.5)

---

## 1. One-line product

An autonomous agricultural advisor that takes a Bangladeshi smallholder farmer from an empty
field to a **costed, weather-aware, explained season plan** through a conversation — and keeps
advising through harvest with alerts, scenario simulation, and a bdapps-powered input checkout.

## 2. Why an agent (not a chatbot) — the judged behaviors

The judges score five agentic behaviors explicitly. Every feature below must be traceable to at
least one of these; if a feature demonstrates none of them, it is out of scope.

| # | Behavior | How AgriSense demonstrates it |
|---|----------|-------------------------------|
| A1 | **Tool use** | Real calls to Open-Meteo (geocoding + forecast), local RAG knowledge base, deterministic engines, bdapps SMS/CaaS. Returned values appear verbatim in the answer and in the visible trace. |
| A2 | **Multi-step planning** | One request ("plan my season") triggers: gap check → geocode → forecast → KB retrieval → crop scoring → season calendar → financials → explanation. The step plan itself is shown in the trace panel. |
| A3 | **Missing-info handling** | A required-fields schema (location, farm size, soil, water, budget, season) is checked deterministically; the agent asks targeted follow-ups **only** for missing fields, never re-asks known ones. |
| A4 | **Memory** | Farm profile + conversation summary + chosen plan persist in SQLite across turns **and across sessions** (Tier-1). Returning farmer is greeted with their plan status. |
| A5 | **Explainability** | Every recommendation states its inputs: farm facts + live weather values + KB citations `[KB:doc§sec]`. Format: "*Do X, because <farm input>, <retrieved value>, <KB source>*". |

## 3. Users

- **Primary persona — the farmer:** smallholder in Bangladesh (e.g., 2 acres, Bogura), low
  patience for jargon, thinks in bigha/acre, ৳ (BDT), and dates. Needs actionable sentences,
  not tables of agronomy. Bengali toggle is a bonus.
- **Secondary persona — the judge:** has 4 minutes + Q&A. Needs to *verify* a number came from
  a real call in seconds. The trace panel, citations, and README real-vs-mock table exist for them.

## 4. Scope by tier (mirrors the official rubric)

### Tier 0 — CORE, required, nothing else starts until this runs end-to-end

| # | Capability | Acceptance criteria ("done when") |
|---|-----------|-----------------------------------|
| T0-1 | Conversational intake | From a vague opener ("I want to plant something"), agent collects location, farm size, soil type, water availability, budget, target season — asking only for missing fields. Profile visible in UI. |
| T0-2 | Live weather grounding | Open-Meteo called with the farm's real lat/lon; actual rainfall/temperature numbers from the response appear in recommendations and trace. Zero invented forecasts. |
| T0-3 | Crop recommendation | ≥3 ranked candidate crops, each with suitability score, water need, risk level, rough profit estimate — computed by the deterministic CropScore engine from KB tables + weather, not LLM guesswork. |
| T0-4 | Season plan | Dated calendar from land prep → harvest for chosen crop: sowing window, fertilizer split timings, irrigation, weed/pest checkpoints, harvest window. Rendered as a timeline in UI. |
| T0-5 | Financial projection | Itemized costs + yield, revenue, net profit, ROI, break-even. Pure-function engine: change any input, outputs recompute correctly live. Unit-tested. |
| T0-6 | Explained reasoning | Every recommendation names farm inputs + retrieved data behind it (A5 format). |
| T0-7 | Knowledge base + RAG | Public agronomic sources (BARC fertilizer guide, DAE/BRRI/BARI crop guides, FAO crop-water, crop calendars) ingested into a local vector KB during the event; advice grounded in retrieved chunks with citations. |
| T0-8 | Visible agent trace | Side panel shows every tool call: name, parameters, raw response, latency. A judge can match any number in the plan to a raw API/KB response. Persisted per session. |

### Payment — officially Tier 2, but **treated as required** (own 10-point rubric row)

| # | Capability | Acceptance criteria |
|---|-----------|---------------------|
| P-1 | bdapps CaaS checkout | In the fertilizer-order flow: list payment instruments → query balance → direct debit (sandbox) → receipt screen + SMS confirmation. Raw S1000 request/response visible in trace. Mock fallback flag exists but demo runs against the real sandbox. |

### Tier 1 — differentiators (start only after Tier 0 demo passes)

| # | Capability | Acceptance criteria |
|---|-----------|---------------------|
| T1-1 | Persistent memory | Close browser, reopen, farmer is recognized (phone/farm id); profile, plan, and conversation summary reload. |
| T1-2 | Proactive weather-triggered advice | Watcher re-checks forecast; rule engine emits e.g. "Heavy rain in 4 days → delay urea top-dress by 4 days" as in-app alert + bdapps SMS. Demoable on demand ("simulate forecast change" dev button, declared as simulation). |
| T1-3 | Fertilizer & irrigation scheduler | Quantities by growth stage from BARC doses × area, organic alternatives, cost per application, irrigation events adjusted by forecast rainfall. |
| T1-4 | Pest & disease risk | Rule table (crop × stage × weather) → likely pests, preventive + treatment options with cost. |
| T1-5 | Scenario simulation | "What if rainfall drops 30%?" / "budget cut 40%?" → FinanceEngine + planner re-run with deltas; UI shows old vs new numbers side by side. |

### Tier 2 — bonus, feature-flagged, only if Tier 0 + payment are stable by H+15

| # | Capability | Notes |
|---|-----------|-------|
| T2-1 | Marketplace / supplier comparison | Seeded supplier catalog (declared mock), ranked by price/distance/rating; feeds the CaaS checkout — this is what makes P-1 feel native. |
| T2-2 | Market price intelligence | Seeded from public DAM bulletins (dated, declared); sell-now/store/wait heuristic with reasoning. |
| T2-3 | Bengali interaction | Language toggle; LLM replies in Bangla; SMS uses encoding 16. |
| T2-4 | Leaf photo disease detection | Gemini vision (free tier) with constrained prompt + KB grounding. Flagged; cut first. |

## 5. Non-goals (explicit, from "What Not to Do")

- No live escrow payments, no real marketplace logistics, no user-generated supplier data.
- No building all 14 original feature areas. Anything not in §4 is rejected by default.
- No time sunk on pixel-perfect UI — rubric says so. Clean > beautiful.
- No feature that can't be demoed in the 4-minute script (see DESIGN.md §10).

## 6. Success metric = the rubric (100 pts)

| Criterion | Pts | Our play |
|---|---|---|
| Agentic behavior | 20 | A1–A5 all visible in one demo pass; trace panel is the proof. |
| Accuracy & practicality | 20 | Deterministic engines do ALL math; LLM only orchestrates + explains. BARC/DAE numbers, BDT units, real dates. |
| Scope & execution | 15 | Tier 0 frozen and rehearsed by H+21; features behind flags. |
| Knowledge base | 12 | Real public docs ingested during event, citations rendered in UI. |
| bdapps CaaS | 10 | Sandbox checkout inside the fertilizer-order story. |
| Explainability | 10 | Enforced "because" format + citations. |
| Technical implementation | 8 | Clean adapters, typed contracts, vitest on engines. |
| Innovation | 5 | Scenario sim + proactive alerts + Bengali on top of a working core. |

## 7. Data honesty declaration (mirrors into README — submission requirement)

| Data | Status |
|---|---|
| Weather, geocoding | **Real** — Open-Meteo live calls |
| Agronomic KB (fertilizer doses, crop calendars, water needs, pest rules) | **Real sources**, collected during event from public BARC/DAE/BRRI/BARI/FAO documents; curated into structured tables by us |
| bdapps SMS / CaaS | **Real sandbox** calls (developer.bdapps.com); `MOCK_BDAPPS=1` fallback exists for offline dev and is declared |
| Market prices | **Seeded** from public DAM bulletins with dates — declared as seeded snapshot |
| Supplier catalog | **Mock/seeded** — declared |
| LLM | Gemini free tier (primary) / Groq (fallback) — provider named in README |

## 8. Submission checklist (hard requirements)

- [ ] Repo named `<TeamName>AgriSense` (**fill team name in MEMORY.md — decide by H+2**), pushed to GitHub.
- [ ] README: setup steps, tools & APIs used, tier reached per feature, real-vs-mock table (§7).
- [ ] Final commit pushed **≥30 min before the 25 Jul 09:00 cutoff** (our internal cutoff: 08:20).
- [ ] Submission link posted in the event channel as soon as it's shared — do not wait for polish.
- [ ] 4-minute demo rehearsed ≥3 times, Q&A crib sheet ready (DESIGN.md §10).

## 9. Constraints & assumptions

- **No paid APIs.** Weather = Open-Meteo (free, keyless). LLM = Gemini AI Studio free tier
  (each teammate creates a key → 3× daily quota, adapter rotates), fallback Groq free tier.
  Embeddings = local Transformers.js (no key, offline-capable). See ARCHITECTURE.md §6.
- **Venue internet is a risk.** Weather responses cached in SQLite; KB fully local; mobile
  hotspot as declared backup; bdapps mock flag for dev only.
- **bdapps IP whitelist (E1303) is the #1 integration gotcha** — provision the app and whitelist
  the venue's public IP in hour 2, re-check whenever calls start failing.
- All application code written inside the 24h window — see RULES.md §1 (compliance, non-negotiable).
