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

**Parking does not move a session.** `moves.js` flips `status: 'unavailable', parked: true` and leaves the session on its own day. So restoring is flipping the flag back in place, and no Move-rules question arises on restore — the boundary above is about *displacement*, not about un-parking.

**Clearing an unavailable date auto-restores that day's parked sessions — unless the day is past** (Mads, 2026-07-17). The POC is the precedent: when a Rest block leaves a day, `restoreParkedOn` returns that day's parked sessions to `planned` on their own. Clearing an unavailable date is that same event, so it behaves the same way. The athlete said the day was off and then said it wasn't; the sessions come back without being asked for.

The guard is the part the POC never needed. Its Rest blocks are always live; a date row can be cleared *after* the day has passed. Restoring then would resurrect a planned-but-never-done session into a past week — but the athlete genuinely *was* unavailable that day, and [ADR 0002](../../../docs/adr/0002-calendar-authority-model.md) holds the training record immutable. So a past day keeps its parked sessions: it is no longer a setting, it is history.

This covers Prescribed Sessions with no special case. Restore flips a status in place rather than moving anything, so the Head Coach's placement is untouched and no authority rule is engaged.

## Acceptance criteria

- [ ] `unavailable_dates` exists via migration, keyed by athlete and date
- [ ] The athlete marks a date unavailable and it renders as such on the calendar
- [ ] Sessions on a newly unavailable day are parked in place — flagged, not moved
- [ ] Parked sessions surface where the athlete can retrieve them
- [ ] Clearing an unavailable date restores availability
- [ ] Clearing an unavailable date on a **future or current** day returns that day's parked sessions to `planned`, in place, without the athlete asking. Prescribed Sessions restore the same way — nothing moves, so no authority rule is engaged
- [ ] Clearing an unavailable date on a **past** day leaves its sessions parked: the unavailability happened, and the record is immutable (ADR 0002)
- [ ] Displacement never produces a session placement the Move rules would refuse
- [ ] Strings resolve through i18n in both `da` and `en`
- [ ] Tests cover parking, retrieval, the Move-rules boundary, and clearing on both a future day (restores) and a past day (stays parked)

## Blocked by

`.scratch/eval-mvp-build/issues/05-session-move-with-guards.md`
