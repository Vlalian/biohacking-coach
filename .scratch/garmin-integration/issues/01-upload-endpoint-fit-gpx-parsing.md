Status: done

# 01 — Upload Endpoint with .fit/.gpx Parsing

## Parent

`.scratch/garmin-integration/PRD.md`

## What to build

Create a `POST /api/garmin/upload` server endpoint that accepts one or more `.fit` or `.gpx` files and returns an array of session objects in the existing session-history format.

Parsed fields per session:
- `date` → activity start date (ISO string)
- `sessionType` → inferred from activity type (running/cycling/swim → "Endurance", strength → "Strength")
- `duration` → activity duration in minutes
- `body` → `null` (no RPE available from file)
- `mind` → `null`
- `note` → "Imported from Garmin" + activity name if available

The parsed sessions are returned to the frontend, stored in localStorage alongside manually recorded sessions, and passed to the Coach in session history. The Coach treats sessions with `body: null` as historical context.

Volume cap: up to 20 files or 6 months of history, whichever is reached first. Older sessions beyond the cap are silently dropped.

## Acceptance criteria

- [ ] `POST /api/garmin/upload` accepts multipart form upload of `.fit` and `.gpx` files
- [ ] A valid `.gpx` file returns an array of session objects with correct `date`, `sessionType`, and `duration`
- [ ] A valid `.fit` file returns an array of session objects with correct `date`, `sessionType`, and `duration`
- [ ] `body` and `mind` are `null` for all imported sessions
- [ ] Sessions beyond the volume cap are dropped silently
- [ ] Parsed sessions stored in localStorage appear in the Training Plan calendar as historical entries
- [ ] The Coach references imported session history in the first Weekly Session

## Blocked by

None — can start immediately.
