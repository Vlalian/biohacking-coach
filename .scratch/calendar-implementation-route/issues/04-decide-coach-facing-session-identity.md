Label: wayfinder:grilling
Status: done
Assignee: claude (Mads's session, 2026-07-09)
Created: 2026-07-09
Resolved: 2026-07-09

# 04 — Decide the Coach-facing session identity

## Question

Once `"YYYY-MM-DD-{index}"` keys are gone, what identifier does the prompt layer use for a session? Multiple Sessions Per Day specified `skippedSessions` entries keyed `"2026-06-23-1"` so the Coach could say "you skipped the afternoon run on Wednesday"; the Draggable Calendar adds the Session Move log to the Weekly Session prompt. Both now sit on entities. Decide:

- **What the Coach sees**: raw entity ids are meaningless to an LLM — does the prompt layer render sessions as (date, type, position-in-day) tuples? Is there a human-readable handle?
- **The write path**: when `agreeWeeklyPlan()` lands a plan, sessions must be created as entities (extraction already returns an array; it must allow duplicate `dayOfWeek`). Who mints ids — the extraction response, or the store on insert?
- **Consistency**: skips (`status: 'skipped'`), the Move log, and per-session feedback should reference sessions the same way in `/api/weekly` context — one convention, used by all three.

Output: the identity convention and the plan-agreement write path recorded here; consequences flow into the affected issue bodies via the sequencing ticket (notably [Weekly Session: multi-session days in plan extraction and prompt](../../multi-session-day/issues/04-weekly-session-multi-session-prompt.md), which is the one Multi-Session-Day issue that survives largely intact).

## Resolution

Resolved with Mads, 2026-07-09.

**The convention (Mads): natural references.** Everywhere the prompt layer mentions a session — `skippedSessions`, per-session feedback context, and the coming Session Move log — it renders **date + type** ("Wed 2026-07-15: Recovery, skipped"), adding the position ("2nd Endurance") **only** when two same-type sessions share a day, the one genuinely ambiguous case. Entity ids never appear in prompts; the Coach only reads and speaks about sessions, it does not address records. If a future feature (e.g. Coached Mode) needs the Coach to point at a specific record, ids can be added to the context then as a small, isolated change. This matches today's rendering (`${s.date} ${s.sessionType}` in `buildWeeklyContext`) extended with the ambiguity fallback, and protects the Peer Authority voice.

**The write path (design, follows from prior decisions):**

- `/api/weekly/plan` extraction keeps its `dayOfWeek`-based schema but explicitly **allows duplicate `dayOfWeek` values**; the array order of a day's sessions defines their `dayOrder`.
- `agreeWeeklyPlan()` converts `dayOfWeek` → `dateKey` (as today), then **replaces that week's provisional (template-seeded) sessions** with coach-origin entities via the store; the store mints ids on insert (per the migration ticket). The plan-history archiving side effect is subsumed by the store — past sessions are already entities; the separate `bh_plan_history` append becomes migration-only legacy input.
- The `skippedSessions` payload is built from the store (entities with `status: 'skipped'` in the week window) and rendered per the convention above — the compound-key format from the old plan is gone.

The backlog-sequencing ticket folds this into the rewrite of [Weekly Session: multi-session days in plan extraction and prompt](../../multi-session-day/issues/04-weekly-session-multi-session-prompt.md) and the prompt-layer parts of [The Coach sees the moves](../../draggable-calendar/issues/08-coach-sees-the-moves.md).
