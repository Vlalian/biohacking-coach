Status: ready-for-agent

# PRD — Multiple Sessions Per Day

> **Superseded (2026-07-09/12, [Calendar Implementation Route](../calendar-implementation-route/MAP.md)):** the Draggable Calendar's entity store is the single data-model foundation — the `sessionIndex`/compound-key scheme below never ships. Issues 01–03 are closed-superseded (their surviving material absorbed into Draggable Calendar issues 01–03); [issue 04](issues/04-weekly-session-multi-session-prompt.md) survives, rewritten onto entities, at route position 2. This document remains as background only.

## Problem Statement

Ironman training commonly involves multiple sessions on the same day — a morning swim followed by an afternoon run, a strength session alongside a recovery ride, or a brick workout (bike + run back to back). The current POC models exactly one session per day. This means the calendar, the feedback prompt, and the weekly plan extraction all silently discard the multi-discipline reality of Ironman training. An athlete looking at the Training Plan sees a single dot where their day may actually contain two or three distinct efforts.

## Solution

Extend the POC so that a day in the Training Plan can hold one or more sessions, each independently typed, rated, and skipped. The calendar renders multiple colour-coded dots side by side for multi-session days. Expanding a day shows each session as its own panel. Feedback and skip marking are per-session. The Coach can propose multi-session days in the Weekly Plan.

The change is a data model upgrade — from one session per day to an array — that cascades through the calendar, feedback, and prompt layers.

## User Stories

1. As an Ironman trainee, I want the Training Plan to show multiple dots on days with more than one session so that I can see the full training load for that day at a glance.
2. As an Ironman trainee, I want each session on a multi-session day to have its own type colour-code so that I can distinguish a swim from a run at a glance.
3. As an Ironman trainee, I want to expand a multi-session day and see each session listed separately with its own type, duration, zone, and Coach note.
4. As an Ironman trainee, I want to rate each session individually so that Body Feedback and Mind Feedback reflect the specific effort of that session, not the whole day.
5. As an Ironman trainee, I want to mark individual sessions as skipped so that a missed morning swim doesn't cancel out the afternoon run I still completed.
6. As an Ironman trainee, I want the Coach to be able to propose two sessions on the same day in the Weekly Plan (e.g. "swim in the morning, easy run in the afternoon").
7. As an Ironman trainee, I want a Recovery session to be proposable alongside another session on the same day (e.g. a hard ride followed by a recovery swim).

## Implementation Decisions

### Data model

The core change: a day's sessions are represented as an array rather than a single object.

**`bh_week_plan` storage format** changes from:
```json
{
  "weekStart": "2026-06-23",
  "sessions": [
    { "dayOfWeek": "Monday", "type": "Endurance", "duration": "90min", "zone": "Z2", "note": "..." }
  ]
}
```
to:
```json
{
  "weekStart": "2026-06-23",
  "sessions": [
    { "dayOfWeek": "Monday", "sessionIndex": 0, "type": "Endurance", "duration": "90min", "zone": "Z2", "note": "..." },
    { "dayOfWeek": "Monday", "sessionIndex": 1, "type": "Recovery", "duration": "30min", "zone": "Z1", "note": "..." },
    { "dayOfWeek": "Tuesday", "sessionIndex": 0, "type": "Intensity", "duration": "60min", "zone": "Z4", "note": "..." }
  ]
}
```

`sessionIndex` is the 0-based position within the day, used as a stable identifier for linking feedback and skip status.

**`bh_session_feedback` storage key** changes from date string (`"2026-06-23"`) to date+index string (`"2026-06-23-0"`, `"2026-06-23-1"`). This is a key-space change only — the value shape is unchanged.

Existing single-session localStorage entries (keyed by plain date string) are treated as session index 0 for backward compatibility during POC development.

**`SESSION_DEFAULTS`** in the calendar (the phase-based mock session data) should be extended to allow arrays where a day has more than one default session. For simplicity in the POC, most days keep a single session — only specific phase/day combinations that naturally produce two sessions (e.g. brick days, recovery + main session) need multiple entries.

### Calendar rendering

- The dot area for a day expands horizontally to show multiple dots side by side (up to 3 — beyond that, a `+N` overflow indicator).
- Each dot uses the existing colour coding by session type (Endurance=blue, Intensity=red, Tempo=amber, Recovery=green, Rest=grey).
- Dot style (solid/outline/muted) is per-session based on its individual completion/skip status.
- A day is considered "completed" (all solid) only when all its sessions are rated. A day with one rated and one outline session shows mixed dot styles.

### Day expansion

- Expanding a multi-session day shows each session as a separate sub-panel, in sessionIndex order.
- Each sub-panel shows: session type label, duration, zone, Coach note, status badge, and its own "Rate this session" / "Mark as skipped" / "Discuss with Coach" action buttons.
- Single-session days are visually unchanged from the current expansion design.

### Per-session feedback

- The Session Feedback Prompt is invoked with `dateKey` as `"YYYY-MM-DD-{sessionIndex}"`.
- The `sessionType` label in the modal header uses the specific session's type (e.g. "Recovery" not just the day's first session type).
- No other changes to `showFeedbackPrompt` — the key change handles the rest.

### Per-session skip marking

- "Mark as skipped" stores `{ skipped: true, sessionType: '...' }` under the `"YYYY-MM-DD-{sessionIndex}"` key.
- The `skippedSessions` array passed to `/api/weekly` uses the same key format so the Coach can reference specific sessions (e.g. "I see you skipped the afternoon run on Wednesday").

### Weekly Session prompt and plan extraction

- Update the `/api/weekly/plan` extraction prompt to allow multiple sessions per day. The response schema already uses an array of session objects — the only change is allowing duplicate `dayOfWeek` values (which the current prompt may implicitly prevent).
- Update `buildWeeklyContext` to clarify that the Coach may propose two sessions on the same day when appropriate for the athlete's phase and load.
- Update `agreeWeeklyPlan()` in `conversation.js` — the `getNextMondayKey` + session storage logic is unchanged; the calendar `buildWeekPlanMap` function needs to group by day and return arrays instead of single sessions.

### Calendar week plan overlay

- `buildWeekPlanMap` in `calendar.js` currently returns `dateKey → session`. Update to return `dateKey → session[]`.
- `render()` and `expandDay()` consume the array, matching the updated day expansion design.

## Testing Decisions

**Seam 1 — Storage key format:** Given a session rated at date "2026-06-23" sessionIndex 1, `getSessionFeedback("2026-06-23-1")` returns the stored values and `getSessionFeedback("2026-06-23-0")` returns null (or a different session's data). The two sessions are independently stored.

**Seam 2 — Calendar multi-dot rendering:** Given a week plan with two sessions on Monday (Endurance + Recovery), the Monday cell renders two dots in the correct colours. Expanding Monday shows two sub-panels.

**Seam 3 — Weekly plan extraction:** Given a Weekly Session conversation where the Coach proposes a brick session on Thursday ("60min bike Z3 followed by 20min run Z2"), the `/api/weekly/plan` extraction returns two session objects with `dayOfWeek: "Thursday"` and `sessionIndex: 0` and `1`.

Manual verification in the POC is sufficient.

## Out of Scope

- More than 3 sessions per day — the POC dot area supports up to 3 with a `+N` overflow. No design needed beyond this for the POC.
- Drag-to-reorder sessions within a day — not needed for the POC.
- Aggregated daily RPE (combining multiple sessions into a single day score) — the Coach receives individual session feedback; no aggregation in the POC.
- Brick workout as a named session type — brick sessions are represented as two separate sessions (e.g. Endurance bike + Endurance run) sharing a day. No new session type needed.

## Further Notes

- The `sessionIndex` field is the stable identifier within a day. It is set at plan creation time and does not change when sessions are reordered or skipped.
- The backward-compatibility rule (plain date key → session index 0) only applies during POC development. The MVP data layer will use a proper relational schema and will not need this shim.
- This feature is a prerequisite for accurately representing real Ironman training weeks in the POC demo — the expert confirmed that multi-session days are routine, not exceptional.
