# Workstream plan — Labib: bdapps integration + React Native app

> **Phase mapping:** this is the Member-C swimlane: **P0-4 (bdapps provisioning — overdue, do
> first)** → P1-C1/C2 (app walking skeleton, CP1 15:00) → P2-C1/C2 (tabs, CP2 22:00) →
> P3-C1/C2 (checkout, CP3 01:00). The mobile app **replaces** the planned Vite web frontend
> (decision D12 in MEMORY.md). Backend stays the single brain — the app is a thin client;
> **all bdapps calls happen server-side** (secrets + IP whitelist live there, never in the app).
> Written 24 Jul ~11:05 (H+2). Owner: Labib. Folders owned: `mobile/`, `src/bdapps/`,
> `src/payments/`, `src/routes/` (bdapps/payments/chat shell). Hands off: `prisma/schema.prisma`,
> `src/rag/` (phigratio), KB pipeline (navid).

---

## Track 1 — bdapps sandbox LIVE (11:00 → 12:00) ⚡ unblocks everything, do before any UI

1. **Provision** at user.bdapps.com → Provisioning → Create New App → **Pro** (steps in
   `BDApps Resources/BDApps-Service-Setup.md`):
   - Allowed Host Address = the public IP the **backend laptop** calls from. Get it via
     ifconfig.me **on the network you'll actually demo from**. Venue wifi NATs may rotate —
     add the phone-hotspot IP too if the form allows multiple. `E1303` later = IP changed, fix here.
   - Enable **SMS** (MO+MT, pick shortcode + keyword), **CAAS**, **Subscription** (OTP uses
     its endpoints). Listener URLs: put placeholders now (`https://example.com/bdapps/sms`) —
     outgoing calls (SMS send, balance, debit, OTP) don't need listeners; fix them later with
     ngrok only if we demo inbound SMS/USSD.
   - Copy `applicationId` + password → `.env` (`BDAPPS_APP_ID`, `BDAPPS_PASSWORD` — confirm
     exact names in `src/bdapps/config.ts`). Never committed.
2. **Whitelist test numbers** (the team's Robi SIMs) if the app is in whitelist mode (`E1343`).
3. **Smoke test with the existing CLI** (`npm run bdapps` → `src/bdapps/cli.ts`): balance
   query + one real SMS to your own SIM. Target: first **S1000 before 12:00**.
4. Blocked on approval? Walk to the bdapps mentor desk immediately — they're the sponsor;
   log outcome in MEMORY.md §4.

*The pre-event client module already wraps every endpoint we need — this track is about
credentials, provisioning, and proving real S1000s, then building the missing service layer
on top (Track 2).*

## Track 2 — Payment service + trace logging (12:00 → 13:30)

New `src/payments/service.ts` (single implementation used by BOTH the REST route and the
agent's `checkout_order` tool later):

```
checkout({ farmerId, planId?, sessionId?, mobile, amountBdt, items })
  1. bdapps.listPaymentInstruments(mobile)          → expect "Mobile Account"
  2. bdapps.queryBalance(mobile)                    → chargeableBalance < amount?
       → persist status="insufficient", return friendly result (this is a DEMO branch, not an error)
  3. bdapps.directDebit({ mobile, amount, externalTrxId: `AGS-${planId?.slice(0,8)}-${Date.now()}` })
  4. persist BdappsPayment row (schema already exists): status, request/response payloads,
     receiptNumber = internalTrxId
  5. bdapps.sendSms(mobile, receipt text)           → order confirmed + amount + trxId
  6. if sessionId: write each step as an AgentToolCall row → judge-visible trace for free
```

- Routes: `POST /api/payments/checkout`, `GET /api/payments/:id` (receipt screen data).
- **Mock switch:** `MOCK_BDAPPS=1` → wrapper around the client returns cheatsheet-shaped
  canned responses tagged `mock: true` (dev/offline only; README declares it; demo uses real sandbox).
- Retry only on `E1318/E1602/E1603`; never reuse an `externalTrxId`.
- **Tests (vitest, mocked fetch):** request bodies match the cheatsheet examples exactly
  (`tel:8801…` prefix, string amount, credentials present); checkout state machine covers
  success + insufficient + network-fail paths.

## Track 3 — Expo React Native app (13:30 → CP1 15:00 walking skeleton, then iterate)

**Setup (30 min):**
- `npx create-expo-app@latest mobile` (tabs + TypeScript template) — public scaffolding, allowed.
- Stay in **Expo Go** on a real Android phone all hackathon — no ejecting, no native modules.
- `EXPO_PUBLIC_API_URL=http://<laptop-LAN-ip>:3000`. Phone + laptop on the **same hotspot**
  (venue wifi often isolates clients — test this in the first 10 minutes; hotspot is primary).
- Screen mirror for judging: **scrcpy** over USB — install + test it now, not at 09:30 tomorrow.

**Tabs (bottom nav):** `Chat` · `Plan` · `Money` · `Alerts` · `Trace`. Farm profile strip on top of Chat.

| Order | Build | Notes |
|---|---|---|
| 1 | API client + health ping | proves phone↔laptop networking before anything else |
| 2 | Chat screen | message list, input, **inline tool-call chips** rendered in-stream as the agent works (mobile's version of the trace panel — very demoable) |
| 3 | SSE hook | `react-native-sse` (pure-JS EventSource, POST body supported, works in Expo Go). **Verify with a tiny test endpoint before building on it.** Fallback flag: non-streaming POST returning the full turn, then fetch trace. |
| 4 | Trace tab | list from `GET /api/sessions/:id/trace` (reads `AgentToolCall` rows) — expandable raw JSON per call; works as soon as ANY tool logs, even before the loop is finished |
| 5 | Plan tab | `SeasonPlan` + `SeasonPlanItem` timeline, grouped by month, cost per item |
| 6 | Money tab | projection summary (from plan row) + **checkout flow**: cart → confirm sheet (shows live balance) → pay → receipt card; the confirmation **SMS lands on the same phone on stage** — rehearse that moment |
| 7 | Alerts tab | list + pull-to-refresh; wire to alert engine when it exists |
| 8 | OTP login (flag `EXPO_PUBLIC_OTP=1`) | phone → `requestOtp` → code → `verifyOtp` → creates `FarmerProfile` with `bdappsMobile` + masked subscriberId. Extra bdapps usage, judge-visible; build only after checkout works |

**Chat contract (agree with the agent-loop owner at the next standup — it's already specced
in DESIGN.md §3, reuse verbatim):** `POST /api/chat {sessionId?, farmerId?, farmId?, message}`
→ SSE `ChatEvent`: `token | plan | trace | profile | card | alert | done`. Until the loop
exists, wire against a stub route that echoes + emits two fake trace events — the app and the
agent then integrate at CP1 (15:00) without waiting on each other.

## Deadlines & checkpoints for this workstream

| Time | Must be true |
|---|---|
| 12:00 | First real S1000 (balance or SMS) with our credentials |
| 13:30 | Checkout service + tests green against mock; route up |
| 15:00 — CP1 | Phone app: chat renders streamed reply + trace chips (stub or real agent) |
| 18:00 | Plan/Money tabs render seeded plan; checkout works end-to-end vs sandbox |
| 22:00 — CP2 | Full Tier-0 flow demoed ON THE PHONE |
| 01:00 — CP3 | Conversational checkout + SMS receipt live; OTP if time allowed |

## Risk watchlist (this workstream)

- **Venue wifi client isolation** breaks phone↔laptop → hotspot primary, tested at setup.
- **E1303** whenever the backend's public IP changes → re-edit Allowed Hosts, keep the
  provisioning tab open all day.
- **ngrok URL rotation** (free tier) → only matters for inbound listeners; don't block
  checkout on it.
- **Expo Go + SSE quirk** → tested in step 3 before the chat is built on it; fallback flag ready.
- **Small debit amounts only (৳5–20)** on real test SIMs; insufficient-balance is a feature
  branch of the demo, not a failure.
- Keep every quantity/date/৳ figure in the app coming from API responses — the app invents
  nothing, same rule as the agent.
