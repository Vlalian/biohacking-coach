Status: ready-for-agent

# 01 — Data model: session array per day

## Parent

`.scratch/multi-session-day/PRD.md`

## What to build

Upgrade the storage format for both `bh_week_plan` and `bh_session_feedback` to support multiple sessions per day. This is the foundational change that all other issues in this feature depend on.

**`bh_week_plan` sessions array** — add a `sessionIndex` field (0-based integer) to every session object. The array may now contain multiple objects with the same `dayOfWeek` value. The `sessionIndex` distinguishes them within the day and serves as the stable identifier for linking feedback and skip status. The rest of the session object shape (`type`, `duration`, `zone`, `note`) is unchanged.

**`bh_session_feedback` key format** — change from plain date string (`"2026-06-23"`) to date+index string (`"2026-06-23-0"`, `"2026-06-23-1"`). Update `getSessionFeedback`, `setSessionFeedback`, and all call sites to use the compound key. The value shape is unchanged.

**Backward compatibility** — existing localStorage entries keyed by plain date string (from before this change) are treated as `sessionIndex 0` when read. Implement this as a fallback in `getSessionFeedback`: if no entry exists for `"YYYY-MM-DD-0"`, check for `"YYYY-MM-DD"` and return that instead. This prevents existing test data from disappearing during POC development.

**`SESSION_DEFAULTS`** in the calendar — add a small number of multi-session day examples to demonstrate the feature. Suggested: add a Recovery session alongside the main session on one day per phase (e.g. a Monday Endurance + Recovery combination in Base Building). Keep the majority of days as single-session to reflect realistic load distribution.

**`getLastWeekFeedback`** in `feedback.js` — update to handle compound keys correctly. When grouping or iterating feedback entries, parse the key as `"YYYY-MM-DD-{index}"` rather than assuming it is a plain date.

## Acceptance criteria

- [ ] `bh_week_plan` session objects include a `sessionIndex` field
- [ ] Two sessions on the same `dayOfWeek` can coexist in the sessions array with `sessionIndex` 0 and 1
- [ ] `setSessionFeedback("2026-06-23-1", data)` stores independently from `setSessionFeedback("2026-06-23-0", data)`
- [ ] `getSessionFeedback("2026-06-23-1")` returns only the data for that index
- [ ] `getSessionFeedback("2026-06-23-0")` falls back to a plain `"2026-06-23"` entry if no indexed entry exists
- [ ] `SESSION_DEFAULTS` includes at least one day with two sessions in at least one training phase
- [ ] `getLastWeekFeedback` correctly handles compound date+index keys

## Blocked by

None — can start immediately.
