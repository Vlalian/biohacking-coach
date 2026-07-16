Status: ready-for-agent
Label: wayfinder:task

# 14 — The athlete marks a day unavailable and the plan respects it

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The athlete marks a date unavailable — travel, work, life — and Displacement parking handles the sessions that fall on it.

The POC's `moves.js` and `drawer.js` and the `calendar.drawer` / `calendar.expansion` tests are the specification, alongside [ADR 0002](../../../docs/adr/0002-calendar-authority-model.md) on calendar authority. The `parked` column already exists on `sessions` from slice 04.

Brings `unavailable_dates` — athlete plus date, the last table this effort's slices need from the signed-off schema.

Keep the boundary with slice 05 clean: the Move rules decide whether a session *may* move. Displacement decides what happens to sessions on a day that has become unavailable. They meet, and the Move rules stay the authority on legality — Displacement does not get to smuggle a session into a past week.

## Acceptance criteria

- [ ] `unavailable_dates` exists via migration, keyed by athlete and date
- [ ] The athlete marks a date unavailable and it renders as such on the calendar
- [ ] Sessions on a newly unavailable day are parked
- [ ] Parked sessions surface where the athlete can retrieve them
- [ ] Clearing an unavailable date restores availability
- [ ] Displacement never produces a session placement the Move rules would refuse
- [ ] Strings resolve through i18n in both `da` and `en`
- [ ] Tests cover parking, retrieval, clearing, and the Move-rules boundary

## Blocked by

`.scratch/eval-mvp-build/issues/05-session-move-with-guards.md`
