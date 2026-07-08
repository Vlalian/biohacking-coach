Status: ready-for-agent

# 03 — Per-session feedback and skip marking

## Parent

`.scratch/multi-session-day/PRD.md`

## What to build

Update the Session Feedback Prompt and skip marking to operate at session level rather than day level, using the compound `"YYYY-MM-DD-{sessionIndex}"` key introduced in issue 01.

**Session Feedback Prompt:**
- All call sites that invoke `showFeedbackPrompt` with a plain date key now pass `"YYYY-MM-DD-{sessionIndex}"` instead.
- The modal header label uses the specific session's `sessionType` (e.g. "Recovery — how did it go?") rather than a day-level type.
- No other changes to `showFeedbackPrompt` itself — the key change is sufficient.

**Skip marking (from issue `expert-feedback-poc-updates/04`):**
- The "Mark as skipped" action, when invoked from a session sub-panel, stores `{ skipped: true, sessionType }` under `"YYYY-MM-DD-{sessionIndex}"`.
- Skipping one session on a multi-session day does not affect any other session on that day.
- "Undo skip" removes only that session's entry.

**`skippedSessions` context for Weekly Session:**
- The array passed to `/api/weekly` is built by scanning `bh_session_feedback` for entries with `skipped: true` within the current week window.
- Each entry in `skippedSessions` includes `{ dateKey: "YYYY-MM-DD-{index}", date, sessionIndex, sessionType }` so the Coach prompt can reference specific sessions naturally ("you skipped the Recovery session on Wednesday").

**`simulateWorkoutComplete` (the "Rate this session" banner button):**
- Currently calls `showFeedbackPrompt` with today's date and a phase-inferred session type.
- For the POC, this button represents the first session of the day (`sessionIndex: 0`). Update the key passed to `"YYYY-MM-DD-0"`.

## Acceptance criteria

- [ ] Rating the first session on a multi-session day stores under `"2026-06-23-0"` and does not affect `"2026-06-23-1"`
- [ ] Rating the second session stores under `"2026-06-23-1"` independently
- [ ] The feedback modal header shows the correct session type for each session
- [ ] Skipping one session on a day leaves other sessions on that day unaffected
- [ ] `skippedSessions` passed to `/api/weekly` correctly identifies skipped sessions by date and sessionIndex
- [ ] "Rate this session" banner button rates sessionIndex 0 for today

## Blocked by

`.scratch/multi-session-day/issues/01-data-model-session-array.md`
