Status: done

# PRD — Garmin Historical Data Upload

## Problem Statement

Experienced athletes arrive at the app with months or years of real training data on Garmin (or similar devices), but the app starts from zero. The Coach has no historical context and must build a picture of the athlete from scratch over several weeks of sessions. For a veteran Ironman athlete with established training patterns, this cold-start period feels patronising — the Coach gives generic advice when it could be giving specific advice grounded in their actual history.

## Solution

Allow experienced athletes to upload historical training files (.fit or .gpx) during onboarding. The server parses these into the existing session-history format the Coach already uses. The Coach receives this history from the first session, immediately able to reference real patterns, real load, and real trends.

Live Garmin API integration (streaming real-time data from the Garmin platform) is a V1 feature. For the POC, file upload is the mechanism.

## User Stories

1. As a veteran Ironman trainee, I want to upload my recent training history from Garmin during onboarding so the Coach understands my fitness level and patterns from day one.
2. As a veteran Ironman trainee, I want to upload multiple files at once so I can provide several months of history in one step.
3. As a veteran Ironman trainee, I want the Coach to reference my historical training in the first session so the advice is immediately specific to me rather than generic.
4. As an experienced athlete, I want to skip the upload if I don't want to share historical data, and still complete onboarding normally.
5. As an athlete, I want the upload to accept both .fit and .gpx file formats so I can use files from Garmin Connect, Wahoo, or any compatible export.

## Implementation Decisions

### Entry point

The upload step appears in MCQ onboarding for `veteran` and `intermediate` experience levels — after the clarifying questions. It is explicitly optional: "Upload recent training history (optional) — .fit or .gpx files from Garmin or Wahoo."

Beginners do not see the upload prompt; they do not have relevant history to upload.

### Server endpoint

A new `POST /api/garmin/upload` endpoint accepts one or more `.fit` or `.gpx` files (multipart form upload). It parses each file and returns an array of session objects in the existing session-history format:

```json
[
  {
    "date": "2026-05-14",
    "sessionType": "Endurance",
    "duration": 90,
    "body": 6,
    "mind": 7,
    "note": "Parsed from Garmin .fit file"
  }
]
```

The session-history array is stored in localStorage under the existing session-history key and passed to the Coach in the same way as manually recorded sessions.

### Parsing

`.gpx` files are XML and parseable with standard Node.js tools. `.fit` files use the binary FIT protocol — a parsing library (e.g. `@garmin/fit-sdk` or `fit-file-parser`) is used server-side.

Parsed fields mapped to the session-history format:
- `date` → activity start date
- `sessionType` → inferred from activity type (running → "Endurance", cycling → "Endurance", swim → "Endurance", strength → "Strength"). Session type mapping is approximate for the POC.
- `duration` → activity duration in minutes
- `body` and `mind` → not available from file; set to `null` (no RPE in the file)
- `note` → "Imported from Garmin" + activity name if available

Sessions with `body: null` are treated as historical context by the Coach — the Coach knows these are imported, not self-rated.

### Volume limit

For the POC, a reasonable cap applies: up to 20 files or 6 months of history, whichever comes first. Older sessions beyond the cap are silently dropped. The Coach's context window limits how much history is useful anyway.

### Live Garmin API (out of scope for POC)

Garmin's Connect API allows reading an athlete's full activity history without file export. This is the V1 integration path: the athlete authenticates with Garmin Connect during onboarding, and the app pulls recent activities automatically. The parsed format is identical to the file upload format, so the Coach integration requires no changes. The upload mechanism is a stepping stone to the API.

## Testing Decisions

Good tests verify the parsing output through the upload endpoint, not the internal file parsing logic.

**Seam:** `POST /api/garmin/upload` with a valid `.fit` or `.gpx` file. The response contains an array of session objects in the existing session-history format, with correct `date`, `sessionType`, and `duration` values parsed from the file. `body` and `mind` are `null`.

Manual verification: upload a sample Garmin .fit file, confirm the returned sessions appear in the Training Plan calendar as historical entries and are referenced by the Coach in the first Weekly Session.

## Out of Scope

- Live Garmin Connect API integration — V1
- Wahoo, Polar, Suunto, Apple Watch file format support beyond .fit and .gpx — V1
- Retroactive RPE assignment for imported sessions
- Displaying imported sessions differently from manually recorded ones in the calendar — the Coach knows they are imported; the UI treats them identically

## Further Notes

The historical data upload is a cold-start accelerator for the veteran athlete segment — the group most likely to be sceptical of an AI coach and most likely to have established training data. Getting the Coach to reference real history in the first session is a key trust-building moment for this segment.

The file upload mechanism also serves as the integration point for future Garmin API work: the server-side parsing logic is the same, only the input source changes from a file to an API response.

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): all child issues done and feature verified present in the POC. Status set to done.
