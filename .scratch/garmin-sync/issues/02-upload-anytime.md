Status: done (2026-07-15) — note: imports use `origin: 'garmin'` (not 'athlete') so device-recorded facts stay read-only under every existing edit/delete guard; `source` remains the provenance field per PRD.

# 02 — Upload anytime

## Parent

`.scratch/garmin-sync/PRD.md`

## What to build

An "Upload workout" affordance in the Training Plan view (Session Drawer region — exact placement per implementer's judgment, matching existing drawer patterns). Multi-file input accepting `.fit`/`.gpx`, posting to the existing endpoint, available every day, not just onboarding.

Each imported workout becomes a completed session on its actual date:

- Entity in `bh_sessions` via `createSession`: `status: 'completed'`, type from the response `sessionType`, plus new optional provenance fields `source: 'garmin'`, `startTime`, `summary`. `origin` semantics untouched.
- Streams stored under one localStorage key per session: `bh_stream_<sessionId>`. Session deletion paths (if any apply to completed sessions) remove the stream key.
- Dedup: a workout whose `startTime` exactly matches an existing `source: 'garmin'` entity is skipped.

Result feedback: a toast/inline line reporting "N imported, M already known" (wording via translation keys). No calendar-matching logic in this slice — every import is standalone; matching is issue 03.

All athlete-visible labels ship EN + DA translation keys.

## Acceptance criteria

- [ ] Uploading files from the Training Plan view creates completed sessions on their actual dates, visible as solid dots in the calendar
- [ ] `bh_stream_<id>` keys hold the streams; the entity holds `source`, `startTime`, `summary`; `bh_sessions` hot path carries no stream arrays
- [ ] Re-uploading the same file creates nothing and the result line counts it as already known
- [ ] Import works for past dates outside the current week (calendar renders them; past-week freeze rules unaffected — imports are creations, not moves)
- [ ] All labels resolve through EN + DA translation keys
- [ ] Existing suite stays green; new jsdom tests via exported handlers cover the import-to-entity mapping, stream-key writing, and the dedup table

## Blocked by

01 — needs `startTime`/`summary`/`streams` in the endpoint response.
