Status: done

# 02 — Manual "Mark as Unavailable" in Calendar

## Parent

`.scratch/coach-constraint-memory/PRD.md`

## What to build

Add a "Mark as unavailable" action to day expansion panels in the Training Plan calendar. The athlete can mark any future day as unavailable without opening a conversation. The day is immediately stored as unavailable in localStorage. An "Undo" option in the expansion panel reverses it.

Unavailable days are passed to the next Weekly Session as context so the Coach does not schedule sessions on those dates.

Storage: add an `unavailable: true` flag to the existing `bh_session_feedback` localStorage structure, keyed by date — the same pattern as skip marking. Unavailable days from the upcoming week are included in the `unavailableDates` array passed to `/api/weekly`.

The calendar renders unavailable days with a distinct visual treatment (e.g. a greyed-out or crossed cell indicator).

## Acceptance criteria

- [ ] Future day expansion panels show a "Mark as unavailable" button
- [ ] Clicking it immediately marks the day as unavailable — no dialog, no conversation
- [ ] The calendar renders the day with a distinct unavailable visual treatment
- [ ] An "Undo" option in the expansion panel removes the unavailable status
- [ ] Unavailable status persists across page reload
- [ ] The Weekly Session receives an `unavailableDates` array containing the marked dates
- [ ] The Coach does not propose sessions on unavailable days in the week plan

## Blocked by

None — can start immediately.
