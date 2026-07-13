Status: done
Route position: 2 of 8 (Calendar Implementation Route)

# 04 — Weekly plan lands in the session store (multi-session days)

## Parent

`.scratch/multi-session-day/PRD.md` — the one surviving issue of that PRD; the rest closed superseded by the Draggable Calendar route.

> Rewritten 2026-07-12 by the Calendar Implementation Route ([identity convention](../../calendar-implementation-route/issues/04-decide-coach-facing-session-identity.md), [entity-store mapping](../../calendar-implementation-route/issues/02-map-multi-session-day-onto-the-entity-store.md)). The `sessionIndex` scheme is superseded: identity is the entity `id`; order-within-day is `dayOrder`.

## What to build

The Weekly Session planning flow produces multi-session days and lands them in the session store.

**`/api/weekly/plan` extraction prompt:**
- Keep the `dayOfWeek`-based response schema, but explicitly allow multiple session objects with the same `dayOfWeek` value. No index field — the array order of a day's sessions defines their `dayOrder`.
- If the Coach returns two objects for "Monday", both survive into `sessions[]`.

**`buildWeeklyContext` — Planning phase instruction:**
- Brief instruction that the Coach may propose two sessions on one day when the athlete's Training Phase and load genuinely call for it (e.g. a main session plus a short recovery block). Never forced.

**`agreeWeeklyPlan()` — write path, multi-session:**
- The basic redirect into the store lands with [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md). This issue extends it: convert `dayOfWeek` → `dateKey` as today, mint `dayOrder` from array position within each day (1-based), and **replace that week's provisional (template-seeded) sessions** with the coach-origin entities via the store; the store mints ids on insert. The separate `bh_plan_history` append stays retired — past sessions are already entities.

**`skippedSessions` context for `/api/weekly`:**
- Built from the store (entities with `status: 'skipped'` in the week window) and rendered as **natural references**: date + type ("Wed 2026-07-15: Recovery, skipped"), adding the position ("2nd Endurance") only when two same-type sessions share a day. Entity ids never appear in prompts.

## Acceptance criteria

- [ ] A Weekly Session where the Coach proposes two sessions on Monday produces two entities with the same `dateKey` and `dayOrder` 1 and 2 after plan agreement
- [ ] Agreeing a plan replaces that week's provisional sessions; other weeks are untouched
- [ ] The Coach in the Planning phase may naturally propose a multi-session day without being blocked by the extraction prompt
- [ ] `skippedSessions` renders natural references; the position qualifier appears only for same-type Doubles
- [ ] Single-session days work exactly as before; existing extraction and prompt tests stay green

## Blocked by

`.scratch/draggable-calendar/issues/01-sessions-become-entities.md`

## Resolution

Implemented 2026-07-13 (commit 3f4f5b8); all acceptance criteria covered by tests, suite green.
