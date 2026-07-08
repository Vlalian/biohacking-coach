Status: ready-for-agent

# 01 — Sessions become entities

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

The per-session-identity refactor from ADR 0002, delivered as an invisible tracer: after this slice the calendar looks and behaves exactly as before, but every session is an identity-bearing entity in a new session store instead of a value computed from date-keyed maps.

The store owns CRUD, week/day queries, and a one-time idempotent migration of existing localStorage state (agreed week plan, plan history, session feedback) into the canonical session shape (see PRD). Future weeks materialize as real stored Planned Sessions seeded from the existing phase templates — they must exist as mutable data, not render-time computation. The calendar's dot rendering, day statuses, and feedback display all read from the store.

## Acceptance criteria

- [ ] Calendar renders visually identical to before (dots, statuses, colours, past-day greying) — from the store
- [ ] Existing localStorage users keep their agreed week plan, history, and ratings after migration; running migration twice changes nothing
- [ ] Future weeks inside the Coach's planning horizon exist as stored, queryable Planned Sessions
- [ ] Rest sessions from the Week Plan are stored as entities (they render in later slices)
- [ ] Store tests: create/query round-trips, week/day queries, migration preservation and idempotence
- [ ] Existing test suite stays green

## Blocked by

None — can start immediately.
