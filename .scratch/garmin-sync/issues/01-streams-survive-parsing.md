Status: done (2026-07-15)

# 01 — Streams survive parsing

## Parent

`.scratch/garmin-sync/PRD.md`

## What to build

The tracer bullet: `POST /api/garmin/upload` stops throwing away the per-sample data. A new require-able module `poc/garmin.js` is born holding all parse/stream logic (server.js keeps only the route handler); the existing `parseFit`/`parseGpx`/`inferSessionType`/`SPORT_MAP` move into it unchanged in behavior.

Response sessions keep every existing field (`date`, `sessionType`, `duration`, `body`, `mind`, `note`) and gain:

- `startTime` — ISO activity start
- `sport` — raw sport string
- `summary` — `{ avgHr, maxHr, avgSpeedMps, distanceM, ascentM, avgPowerW }`, null where the file lacks the channel
- `streams` — columnar arrays at 10 s resolution: `{ t, hr, speedMps, altM, powerW, cadenceRpm }`; `t` = seconds since `startTime`, bucket mean per bin, absent channels omitted entirely (never null-filled arrays)

Pure functions `downsampleRecords(records)` and `summarizeRecords(records)` are exported from `poc/garmin.js`. FIT records come from the parser's `records` output (`fit-file-parser`, mode 'list'); GPX streams are best-effort: `altM` from `ele`, `hr` from the `gpxtpx` extension when present, `speedMps` derived from consecutive trackpoints.

Server stays stateless — parse in memory, respond, discard. No UI in this slice, so no translation keys.

## Acceptance criteria

- [ ] Uploading a GPX fixture returns sessions carrying `startTime`, `summary`, and `streams` with correct bin math (10 s buckets, mean per bin, `t` monotonic from 0)
- [ ] Channels absent from the file are absent from `streams` (key not present) and null in `summary`
- [ ] `downsampleRecords` and `summarizeRecords` handle empty input and a single record without NaN or throw
- [ ] Existing onboarding upload behavior unchanged: all pre-existing response fields intact, six-month cutoff and 20-file cap still enforced
- [ ] Existing suite stays green; new tests cover the pure functions (bin math, sparse channels, edges) and the GPX endpoint end-to-end with a hand-authored synthetic fixture

## Blocked by

None — can start immediately.
