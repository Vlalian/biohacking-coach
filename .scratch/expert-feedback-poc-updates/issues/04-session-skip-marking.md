Status: done

# 04 — Session skip marking

## Parent

`.scratch/expert-feedback-poc-updates/PRD.md`

## What to build

Add a "Mark as skipped" action to Planned Session expansion panels in the Training Plan calendar. The athlete can mark a session as skipped without opening any conversation. The skip is stored instantly, the dot renders muted, and the skipped sessions are included as context in the next Weekly Session so the Coach can reference them naturally during Review.

**Calendar UI:**
- Planned Session expansion panels (future/today sessions with `outline` dot style) gain a "Mark as skipped" button alongside the existing "Discuss with Coach" button.
- Clicking it immediately sets the session's status to `skipped` without any confirmation dialog or conversation.
- The dot for that day re-renders as muted (the existing muted dot style, already defined in the calendar).
- The expansion panel updates to show a "Skipped" status badge instead of the "Mark as skipped" button.
- A skipped session can be un-skipped by opening the expansion panel and clicking "Undo skip", which restores the outline dot and removes the skipped status.
- Completed sessions (already rated) cannot be marked as skipped — the button does not appear on days that already have RPE feedback stored.

**Storage:**
- Skipped status is stored in the existing `bh_session_feedback` localStorage structure as `{ skipped: true, sessionType: '...' }` keyed by date (ISO string), matching the existing pattern for rated sessions.
- If a session is skipped and the athlete later rates it (via "Rate this session"), the rating replaces the skip — the `skipped` flag is removed and the RPE values are stored instead.

**Weekly Session context:**
- The `/api/weekly` route (server-side) already receives `weekFeedback` (last week's Session Feedback). Extend this: also read skipped entries from the feedback store for the current week and pass them as a `skippedSessions` array to the prompt — e.g. `[{ date: '2026-06-24', sessionType: 'Intensity' }]`.
- Update `buildWeeklyContext` to include a brief skipped sessions summary in the context block passed to the Coach. The Coach uses this to reference skips naturally during Review without the athlete needing to re-explain ("I can see you had to skip Thursday's intensity session — what happened?").
- The Coach does not demand justification for skips. It acknowledges them conversationally and moves on unless the athlete raises it.

## Acceptance criteria

- [ ] Planned Session expansion panels show a "Mark as skipped" button
- [ ] Clicking "Mark as skipped" immediately renders the dot as muted — no dialog, no conversation opened
- [ ] The expansion panel shows a "Skipped" status badge after marking
- [ ] An "Undo skip" option in the expansion panel restores the outline dot and removes the skip
- [ ] Already-rated sessions do not show the "Mark as skipped" button
- [ ] Skipped status persists across page reload
- [ ] The Weekly Session receives a `skippedSessions` array containing skipped sessions from the current week
- [ ] The Coach references skipped sessions naturally during the Weekly Session Review without the athlete re-explaining them

## Blocked by

None — can start immediately.
