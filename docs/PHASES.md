# PHASES — 24-hour execution plan (3 members)

> Clock: **H0 = 24 Jul 09:00 · cutoff = 25 Jul 09:00 · judging 10:00.** Written at ~H+2.
> Members: **A = Agent core** · **B = Domain data & engines** · **C = Product (UI, routes, bdapps, README)**.
> Assign real names to A/B/C in MEMORY.md §2 **now**. For any task, ask a Claude session for a
> detailed sub-plan using the bootstrap line in RULES.md §5.4 + the task ID below.
> **Checkpoints (CP) are live demos to the other two members — they gate the next phase.**

---

## Phase 0 — Setup & scaffold (now → 12:00) — ALL HANDS

| ID | Owner | Task | Done when |
|----|-------|------|-----------|
| P0-1 | ALL | Pick team name → create fresh GitHub repo `<TeamName>AgriSense`; add members; correct `user.name/email` on all machines; `.gitignore` (+`.env`) in first commit; copy `docs/` in | repo exists, 3 clones work |
| P0-2 | A | Scaffold: `npm init` server (Express 5 + tsx + TS strict + vitest + zod), `npm create vite` → `web/`, folder skeleton per ARCHITECTURE §3, `shared/types.ts` v1 with core contracts, `.env.example`, Prettier | `npm run dev` boots both; smoke route answers |
| P0-3 | B | Gemini keys ×3 + Groq key created & tested with a curl; start KB source hunt: download BARC Fertilizer Recommendation Guide, DAE/BRRI/BARI crop guides, FAO crop-water tables, crop calendar, recent DAM price bulletin into `kb-sources/` with `SOURCES.md` (url, date) | keys respond; ≥6 quality source docs saved |
| P0-4 | C | bdapps provisioning (per BDApps-Service-Setup): Pro app, enable SMS+CAAS(+Subscription), venue public IP in Allowed Hosts, listener URLs (ngrok placeholder ok), capture `APP_ID`+password into `.env`; verify with one real `POST /sms/send` or balance query | an S1000 response seen (or exact blocker documented + mock path agreed) |
| P0-5 | ALL | 10-min contract review of `shared/types.ts` + `schema.sql` v1 together | all three agree; `contract:` commit on main |

**Risk to burn down NOW:** bdapps IP whitelist (E1303) and account approval latency — that's why P0-4 starts immediately, not at H+13.

## Phase 1 — Walking skeleton (12:00 → 15:00) · **CP1 at 15:00**

Goal: one thin thread through everything: chat → agent loop → 2 real tools → SSE trace → UI.

| ID | Owner | Task |
|----|-------|------|
| P1-A1 | A | LLM adapter (`provider.ts` + Gemini impl + key rotation + Groq failover) with function calling + streaming |
| P1-A2 | A | Agent loop v1 (plan→act→observe, MAX_STEPS, zod arg validation, trace event emission), system prompt v1 (persona + "never invent numbers" + ask-only-gaps) |
| P1-B1 | B | `openMeteo.ts`: geocode + 16-day forecast + SQLite cache; tools `geocode_location`, `get_weather` |
| P1-B2 | B | KB ingest v1: markdown-ify 2 best sources, chunk (~500 tok, metadata `{doc,section,crop}`), MiniLM embeddings via Transformers.js into SQLite; `query_knowledge_base` tool with hybrid (cosine + keyword) retrieve |
| P1-C1 | C | SQLite init + DAOs (`farms`,`sessions`,`messages`,`trace_events`); `POST /api/chat` SSE route streaming `ChatEvent` |
| P1-C2 | C | UI v1: chat pane + collapsible Agent Trace side panel rendering `plan`/`trace` events live; farm profile card |

**CP1 (15:00):** In the browser: "What's the weather looking like for planting in Bogura?" →
agent geocodes, fetches real forecast, answers with real numbers; trace panel shows both raw
calls. *If CP1 slips >1h → simplify: drop streaming tokens (batch reply), keep trace.*

## Phase 2 — Tier-0 complete (15:00 → 22:00) · **CP2 at 22:00** ⭐ the make-or-break phase

| ID | Owner | Task |
|----|-------|------|
| P2-A1 | A | Intake flow: required-fields gap check wired into loop; profile patch tool; never re-ask; multi-step plan visibility (`plan` trace event) |
| P2-A2 | A | Explanation enforcement: citation format `[KB:doc§sec]`, "because <inputs>" template; rolling per-session summary; cross-session profile load (T1-1 groundwork) |
| P2-A3 | A | Prompt hardening loop: 10 adversarial farmer inputs (vague, Bangla-mixed, contradictory, budget-less) — iterate until stable |
| P2-B1 | B | Structured KB tables extracted from sources → `engines/data/`: crop stage/season/soil/water tables, BARC fertilizer doses, cost & yield baselines, farm-gate prices (dated) |
| P2-B2 | B | **CropScore** + **SeasonPlanner** + **FinanceEngine** (pure, vitest-tested: dose math, date math, ROI/break-even, input-change consistency) + tools `rank_crops`, `build_season_plan`, `compute_financials` |
| P2-B3 | B | Finish ingesting remaining KB sources; retrieval quality pass (10 canned agronomy questions return the right chunks) |
| P2-C1 | C | UI tabs: Season Plan timeline (dated tasks), Finance table (itemized, recompute on input tweak), KB citation chips that open the source chunk |
| P2-C2 | C | Session persistence UX (resume by farm/phone id); trace persistence view `GET /api/sessions/:id/trace`; `scripts/seed-demo-farm.ts` + `scripts/smoke-e2e.ts` |

**CP2 (22:00) — Tier-0 gate, run the full demo script §DESIGN-10 start to finish:** vague
opener → targeted follow-ups → real weather → 3 ranked crops with reasons → dated season plan →
itemized financials → every number traceable. **No Tier-1 work starts before this passes.**
*If CP2 slips: cut in order — citation chips UI (keep inline text citations), finance UI tweak-recompute (keep static table), 3rd KB source.*

## Phase 3 — bdapps payment + memory proof (22:00 → 01:00) · **CP3 at 01:00**

| ID | Owner | Task |
|----|-------|------|
| P3-C1 | C | CaaS flow module vs cheatsheet shapes: `list/pi` → `balance/query` → `direct/debit` with unique `externalTrxId`; unit tests assert exact request JSON; wire real sandbox; receipt persisted |
| P3-C2 | C | Checkout UX inside the fertilizer-order story: cart (from seeded suppliers) → pay with Mobile Account → receipt + `send_sms` confirmation; raw request/response in trace panel. Also verify TAP doc (`dev.bdapps.com/API_Documentation/bdapps_tap_api.html`) for any flow difference |
| P3-A1 | A | Tools `create_order`/`checkout_order`/`send_sms` registered; agent can drive checkout conversationally ("order the urea for my basal dose") |
| P3-B1 | B | Seed `suppliers.json` (realistic, declared mock) + `marketPrices.json` from DAM bulletin (dated); tools `list_suppliers`, `get_market_prices` |
| P3-ALL | ALL | Cross-session memory demo polish: restart server + new browser → returning farmer recognized with plan status greeting |

**CP3 (01:00):** conversational fertilizer order → real sandbox debit S1000 → receipt + SMS,
all visible in trace; memory demo passes. *bdapps sandbox hard-down? → `MOCK_BDAPPS=1`, README + demo say "simulated response, real client code + tests" — partial rubric credit beats zero.*

## Phase 4 — Tier-1 differentiators (01:00 → 06:00, staggered naps — see §5)

Priority order (feature-flagged, each demoed to one other member before merge):

| ID | Owner | Feature |
|----|-------|---------|
| P4-B1 | B | **Scenario simulation** (T1-5): `simulate_scenario` deltas → planner+finance re-run; C adds side-by-side compare UI. Cheapest big win — engines are pure. |
| P4-B2 | B | **Fertilizer & irrigation scheduler** (T1-3): stage-wise doses, organic alternatives, rain-aware irrigation skips |
| P4-A1 | A | **Proactive alerts** (T1-2): AlertEngine watcher + rules; `POST /api/dev/simulate-forecast` to trigger on stage (declared as simulation); bdapps SMS on alert; alerts tab (C) |
| P4-B3 | B | **Pest & disease risk** (T1-4): rule table + tool + prevention/treatment costs from KB |
| P4-A2 | A | Q&A robustness: "why?" follow-ups on any recommendation answer with inputs + citations |

## Phase 5 — Tier-2 bonus (03:00 → 07:00, ONLY features already green-lit at CP3)

In order: **T2-1 marketplace ranking UI** (C — mostly done via P3), **T2-2 price intelligence**
sell/store/wait heuristic (B), **T2-3 Bengali toggle** (A — prompt + UI toggle + SMS encoding 16),
**T2-4 leaf photo via Gemini vision** (A, `FLAG_VISION`, first to cut).

## Phase 6 — Hardening & submission package (06:00 → 08:00)

| ID | Owner | Task |
|----|-------|------|
| P6-C1 | C | README final: setup (fresh-clone tested on another laptop!), tools/APIs used, tier table, real-vs-mock table (PRD §7), architecture sketch, demo gif optional |
| P6-ALL | ALL | 3 full rehearsals incl. one hostile "prove it" pass; fix only what breaks the script; record backup video of one clean run; DB snapshot; hotspot tested |
| P6-A1 | A | Kill dead code/flags-off stubs; final prompt freeze; `scripts/smoke-e2e.ts` green on all 3 machines |

## Phase 7 — Freeze (08:00 → 09:00)

**08:00 code freeze** (only demo-killing fixes, pair-reviewed) → **08:20 final push + tag `v1.0`**
→ submit repo link the moment the channel opens → prep demo laptop (seeded DB, both backups,
charger, hotspot). Breathe.

---

## 5. Rest plan (be honest: exhausted people break demos)

01:00–06:00 staggered naps, 2 people always awake: B 01:00–02:30 (after engines done),
A 02:30–04:00, C 04:00–05:30. Nobody codes the demo script past 07:30 without a second pair of eyes.

## 6. Master cut list (when behind, cut top-down, no debate — per RULES §2.3)

1. T2-4 leaf vision → 2. T2-2 price intelligence → 3. T2-3 Bengali → 4. T1-4 pest risk →
5. T1-3 scheduler depth (keep basic doses) → 6. T1-2 alerts (keep the rule engine, drop SMS)
→ 7. marketplace UI polish (keep conversational checkout) → **never cut:** Tier-0 items, CaaS
happy path, trace panel, README honesty.

## 7. Standup ledger (60s at every even hour — RULES §3.6)

Post in team chat: `HH:MM <initial>: shipped ✔ / next → / blocked ✖`. Blockers >20 min escalate immediately.
