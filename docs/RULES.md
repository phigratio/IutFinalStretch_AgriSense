# RULES — AgriSense AI team working agreement

> Non-negotiables first. Everything here exists to prevent the three ways teams lose:
> **disqualification, merge-conflict paralysis, and a demo that dies on stage.**
> **Owner:** whole team — breaking a §1 rule is an immediate team huddle.
> **Last updated:** 2026-07-24 ~10:50 (H+1.8)

---

## 1. Compliance (disqualification-level — zero exceptions)

1.1 **All application code is written inside the 24h window** (24 Jul 09:00 → 25 Jul 09:00).
    The official rules ban pre-built project code. Therefore:
    - The pre-event experiment repo (`iut_final_stretch/`) is **reference-only**. We may *read*
      it to remember an approach, but **no file, function, or snippet is copied** into the
      submission repo. Re-implement from scratch or from *organizer-provided* resources
      (the BDApps cheatsheet, DGD doc, and demo listener code were given to all teams — using
      their request shapes is legitimate).
    - The submission repo is **created fresh during the window**; every commit timestamp falls
      inside it. Do not `git clone`/fork/copy the old repo's history or files into it.
    - Publicly available scaffolding is explicitly allowed: `npm create vite@latest`,
      `npm init`, published templates/libraries. Private pre-event code is not scaffolding.

1.2 **README honesty is a submission requirement**: it must state what is real vs mock/seeded
    (table in PRD.md §7), list tools and APIs used (including AI coding assistants — allowed
    by the rules and listed like any other tool), and the tier reached per feature. Never
    present seeded data as live in the demo or README.

1.3 **Commit authorship:** commits are authored by the three team members' own git identities.
    Commit messages contain **no AI co-author trailers or AI attribution** — write them
    yourself in the conventional format (§3.5). Set `user.name`/`user.email` correctly on all
    three machines at repo creation.

1.4 **Secrets never enter git.** `.env` is gitignored from commit #1; keys live in `.env`
    locally and are exchanged over the team's private chat, not the repo. `.env.example`
    carries variable names only. bdapps credentials are sandbox-scoped but still count.

1.5 **Deadline discipline:** internal freeze 25 Jul 08:00, final push by **08:20**, submission
    link posted immediately when the channel opens. A late masterpiece scores zero.

1.6 Code of conduct: no tampering with shared infra, respectful conduct, own work only.

## 2. Scope control (how hackathons are actually won)

2.1 **Tier gate:** nobody starts a Tier-1 task before the Tier-0 end-to-end demo passes
    (CP2 in PHASES.md), and nobody starts Tier-2 before payment (P-1) passes. The gate is a
    live demo to the other two members, not "it works on my branch".

2.2 **Feature flags:** every post-Tier-0 feature ships behind a `FLAG_*` env switch, OFF by
    default, so a broken extra can never take down the core demo.

2.3 **Cut list is pre-agreed** (PHASES.md §6). When behind schedule we cut from the bottom of
    that list without debate. Adding a feature not in PRD §4 requires all three members to agree
    and something of equal size to be cut.

2.4 **No new runtime dependencies after H+18** (25 Jul 03:00). After that, only code we own.

2.5 **UI time is capped:** rubric explicitly says don't over-invest in UI. One pass for
    clarity + one polish pass at the end. No component libraries beyond Tailwind.

## 3. Git & collaboration (3 people, one repo, no paralysis)

3.1 **Trunk-based:** `main` is always runnable (`npm run dev` boots, smoke script passes).
    Work happens on short-lived branches `feat/<initial>-<slug>` (e.g. `feat/a-agent-loop`),
    merged into `main` **at least every 2 hours** — small merges, tiny conflicts.

3.2 **Merge protocol:** `git pull --rebase origin main` → run `scripts/smoke-e2e.ts` (or at
    minimum boot the server) → push. If a conflict takes >10 min, stop and pair on it
    immediately; never force-push `main`; never rewrite pushed history.

3.3 **Folder ownership = merge safety** (map in ARCHITECTURE.md §3): A owns `server/agent|llm|tools`,
    B owns `server/engines|rag|integrations/openMeteo|seed` + `kb-sources/`, C owns
    `web/`, `server/routes|db|integrations/bdapps` + README. You may **read** anything;
    you **edit** outside your folders only with the owner's ok in chat (or when they're blocked/asleep — then announce it).

3.4 **Contract-change protocol:** `shared/types.ts` and `server/db/schema.sql` are the two
    shared surfaces. To change one: announce in team chat → make the change + update all
    call sites in the same commit → merge to `main` immediately → others rebase. Contract
    commits are prefixed `contract:` so they're findable.

3.5 **Commits:** conventional style, present tense, small:
    `feat(engines): finance projection with break-even`, `fix(bdapps): tel: prefix on msisdn`,
    `contract: add ScenarioResult`, `docs: real-vs-mock table`. Each commit message says *what*
    and, when not obvious, *why* — a judge reading history should see steady intra-window work.

3.6 **Sync cadence:** 60-second standup at every even hour (what shipped / next / blockers),
    plus the three checkpoint demos (CP1/CP2/CP3 in PHASES.md). Blockers >20 min are
    escalated to the team immediately — pride loses points.

3.7 **AI assistant usage (Claude Code etc.):** allowed by the rules and by us, with
    discipline: (a) work from these docs — start sessions by pointing the assistant at
    `docs/MEMORY.md`; (b) keep each session scoped to your owned folders to avoid cross-member
    conflicts; (c) you review every generated diff before commit — you must be able to explain
    any line in Q&A; (d) update `MEMORY.md` at the end of each working session (§5).

## 4. Code quality bar (fast but not sloppy)

4.1 TypeScript strict mode; no `any` on contract boundaries; zod validation on every external
    input (user msgs, tool args, bdapps callbacks, env).

4.2 **Module header comment** (required, and it's how we onboard each other + AI sessions fast):
    every file starts with 2–4 lines: *what this module does, which feature/tier consumes it,
    and what it depends on.* Inline comments only where intent isn't obvious from code.

4.3 **Tests where they matter, not everywhere:** vitest unit tests are mandatory for
    `server/engines/*` (finance math, crop scoring, date arithmetic, alert rules) and for the
    bdapps request builders (assert exact JSON shape against the cheatsheet examples, mocked
    HTTP). UI and glue code are tested by the smoke script + rehearsals, not unit tests.

4.4 Errors: no silent catches. Tool failures return structured `{error}` to the agent loop
    (it can react), are logged, and appear in the trace panel honestly.

4.5 Formatting: Prettier defaults, committed config, no debates.

## 5. Memory & docs discipline (cross-session continuity)

5.1 `docs/MEMORY.md` is the team's shared brain. **Update it when:** a decision is made or
    reversed, a checkpoint passes/fails, keys/credentials status changes, an interface lands,
    or you hand off work / end a session. Append to the log section with `HH:MM — <initials> — <fact>`.

5.2 Never delete log entries; strike through (`~~text~~`) what's obsolete and add the correction.

5.3 Decisions follow the format in MEMORY.md §3 (what/why/alternative rejected) — one line each.
    "Why" matters: judges' Q&A probes decisions, and future sessions must not re-litigate them.

5.4 New Claude/AI session bootstrap line (copy-paste):
    *"Read docs/MEMORY.md, then docs/PRD.md, docs/ARCHITECTURE.md, docs/PHASES.md, docs/DESIGN.md, docs/RULES.md. I am member <A|B|C> working on <task id from PHASES>. Plan before coding; stay inside my owned folders; update MEMORY.md at the end."*

## 6. Demo discipline

6.1 Demo always runs from `main` on the designated demo laptop, from a fresh `git pull` +
    `scripts/seed-demo-farm.ts` reset. Never demo from a feature branch or a dirty tree.

6.2 Rehearse the 4-minute script (DESIGN.md §10) at least 3× before judging; once with a
    hostile "prove this number is real" pass using only the trace panel.

6.3 Backups for judging morning: DB file snapshot, screen-recording of a full good run
    (played only if catastrophe strikes — and said aloud that it's a recording), phone hotspot,
    both other laptops with the repo pulled and seeded.

6.4 During Q&A: answer with inputs and sources ("that 45 kg/acre is the BARC dose for sandy
    loam × 2 acres — here's the KB chunk in the trace"). If asked what's mock: answer instantly
    and honestly (the README table is memorized).
