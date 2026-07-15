Status: done (2026-07-15)

# 03 — Uploads meet the calendar

## Parent

`.scratch/garmin-sync/PRD.md`

## What to build

Imported workouts merge with the plan instead of duplicating it (Mads, 2026-07-15: "complete + offer rating").

Matching, applied per imported workout during the issue-02 import flow:

- If the workout's date has a Planned Session (`status: 'planned'`, not parked): prefer a same-type match; otherwise the earliest unmatched planned session by `dayOrder`. Doubles: a second upload on the same day can complete the second planned session.
- The planned entity is updated in place — `status: 'completed'` plus `source: 'garmin'`, `startTime`, `summary` — keeping its id, Coach note, zone, and duration fields (imported actual duration may overwrite the planned duration; Coach note stays). No duplicate entity.
- No planned session that day → standalone completed session (issue-02 behavior unchanged).

Rating chain: after an upload batch completes, if exactly one imported workout is dated today or yesterday, open the Session Feedback popup for it with `{ preload: false }` — the real version of `simulateWorkoutComplete`. Bulk/backfill imports never chain popups; those sessions are rated from the calendar. Skip stays free.

Any new athlete-visible copy ships EN + DA keys.

## Acceptance criteria

- [ ] Uploading today's workout on a day with one planned session flips that session to completed in place (same id) — one dot on the day, not two
- [ ] Type preference honored: on a Double day (Endurance + Recovery planned), a running upload completes the Endurance session, not the Recovery one
- [ ] Two uploads on a Double day complete both planned sessions; a third becomes standalone
- [ ] Parked sessions are never matched
- [ ] Single recent upload (today/yesterday) opens the rating popup blank; a 10-file backfill opens none
- [ ] Existing suite stays green; new tests cover the match-preference table (type / dayOrder / Double / parked / no-planned) and the rating-chain rule, jsdom via exported handlers

## Blocked by

02 — matching runs inside the import flow.
