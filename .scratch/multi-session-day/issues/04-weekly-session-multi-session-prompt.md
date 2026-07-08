Status: ready-for-agent

# 04 — Weekly Session: multi-session days in plan extraction and prompt

## Parent

`.scratch/multi-session-day/PRD.md`

## What to build

Update the server-side Weekly Session plan extraction and the Coach context prompt to support multiple sessions on the same day.

**`/api/weekly/plan` extraction prompt:**
- Currently the extraction prompt implicitly expects one session per day (one entry per `dayOfWeek`). Update the prompt to explicitly allow multiple session objects with the same `dayOfWeek` value.
- The extracted JSON schema already uses an array of session objects — the only prompt change is making it clear that duplicate `dayOfWeek` values are valid and expected when the Coach proposes multi-session days.
- Add `sessionIndex` to the extracted schema so the array is consistently ordered (0-based, ascending per day).
- Strip and parse the JSON response as before. If the Coach returns two objects for "Monday", both should survive into `sessions[]`.

**`buildWeeklyContext` — Planning phase instruction:**
- Add a brief instruction that the Coach may propose two sessions on the same day when appropriate for the athlete's Training Phase and load (e.g. a swim + a short recovery run, or a main session + a mobility/recovery block). The Coach should not force multi-session days — only propose them when the phase and load genuinely call for it.

**`agreeWeeklyPlan` in `conversation.js`:**
- After plan extraction, sessions are stored as-is under `bh_week_plan`. No change needed here — `sessionIndex` comes from the server response.
- If `sessionIndex` is missing from the server response (Coach did not emit it), assign it on the client as the 0-based position within each day's group before storing.

**`buildWeekPlanMap` in `calendar.js`:**
- Currently maps `dateKey → single session`. Update to map `dateKey → session[]`, grouping sessions by their computed calendar date and ordering by `sessionIndex`.
- Consumers updated in issue 02.

## Acceptance criteria

- [ ] A Weekly Session conversation where the Coach proposes two sessions on Monday produces two objects with `dayOfWeek: "Monday"` and `sessionIndex: 0` and `1` after `/api/weekly/plan` extraction
- [ ] `bh_week_plan` stores both sessions and the calendar overlay renders two dots on Monday
- [ ] The Coach in the Planning phase may naturally propose a multi-session day without being blocked by the prompt
- [ ] `sessionIndex` is present on all stored sessions (assigned client-side if missing from server response)
- [ ] Single-session days continue to work exactly as before

## Blocked by

`.scratch/multi-session-day/issues/01-data-model-session-array.md`
