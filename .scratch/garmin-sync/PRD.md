Status: done (2026-07-15) — all four issues implemented and browser-verified in one session; suite 407/407. Remaining manual step: Mads uploads a real Garmin .fit export end-to-end (real-file verification per Testing Decisions).

# PRD — Garmin Sync (ongoing upload, streams, calendar matching, real panels)

## Problem Statement

The POC's Garmin integration (`.scratch/garmin-integration/PRD.md`, done) is a one-time onboarding import that keeps only date, session type, and duration. After onboarding there is no way to get a real workout into the app, the per-sample data that every physiology metric needs is thrown away at the parse step, and the Information View runs entirely on synthetic data. The benched TSS-family metrics (hrTSS/rTSS/IF/NGP — see reference-app-review.md) stay benched precisely because no sample streams exist anywhere in the system.

## Route decision (Mads, 2026-07-15)

Three connection routes were evaluated:

- **Official Garmin Connect Developer Program** — enterprise-only (no individual applications), requires a company entity + public privacy policy, and the program is currently on hold for new sign-ups. This is the V1/company-stage path, not a POC path.
- **Strava as middleman** — RULED OUT PERMANENTLY. Strava's API agreement (Nov 2024) prohibits using API data in AI models or similar applications and forbids displaying a user's data to anyone but that user (would also break Coached Mode / Head Coach visibility). API-terms equivalent of a license-poisoned repo.
- **Extend the existing file upload** — CHOSEN. The watch already syncs to Garmin Connect; any activity exports as a FIT file. Same parsing seam the official API will feed at V1; only the input source changes.

Unofficial Garmin Connect libraries (username/password scraping) were declined even as a dev convenience.

## Solution

Four tracer-bullet slices:

1. **Streams survive parsing** — the upload endpoint keeps per-sample records (downsampled to 10 s) and a per-workout summary alongside the existing session fields.
2. **Upload anytime** — an upload entry point in the Training Plan view, multi-file, deduplicated, usable long after onboarding.
3. **Uploads meet the calendar** — an uploaded workout on a day with a Planned Session marks it completed and offers the smiley rating (Mads, 2026-07-15: "complete + offer rating"). The upload is the real trigger the Session Feedback Prompt design always anticipated ("V2 = API-triggered from wearable").
4. **First real data in the Information View** — the provider gains a real-data state built from stored sessions + streams; wearable-gated panels (zones, peaks, Recent Bests) render from real uploads (Mads, 2026-07-15: include in this route).

## User Stories

1. As an athlete, I want to upload today's workout file after training so the session is recorded without manual entry.
2. As an athlete, I want an uploaded workout to complete the session the Coach planned for that day, so the calendar reflects reality without double bookkeeping.
3. As an athlete, I want to rate an uploaded session the same way I rate any session, so Body/Mind feedback stays complete.
4. As an athlete, I want the Information View to show my real heart rate, pace, and load data once I've uploaded workouts, instead of demo data.
5. As an athlete, I want re-uploading the same file to be harmless, so I never have to remember what I already imported.

## Implementation Decisions

### Server: parse output extended (slice 1)

Parsing/stream logic moves to a new require-able module `poc/garmin.js` (server.js stays thin). `POST /api/garmin/upload` response sessions keep all existing fields and gain:

- `startTime` — ISO timestamp of activity start (dedup key)
- `sport` — raw sport string from the file
- `summary` — `{ avgHr, maxHr, avgSpeedMps, distanceM, ascentM, avgPowerW }`, absent channels null
- `streams` — columnar arrays at 10-second resolution: `{ t, hr, speedMps, altM, powerW, cadenceRpm }`. `t` is seconds since `startTime`. Channels absent from the file are omitted entirely (never arrays of nulls). A 90-min session ≈ 25 KB.

Downsampling: bucket records into 10 s bins, mean per bin (`t` = bin start). 10 s resolution is sufficient for every planned calculation including the benched TSS family (30 s rolling windows = 3 samples).

GPX: streams limited to what GPX carries — `altM` from `ele`, `hr` from the `gpxtpx` extension when present, `speedMps` derived from consecutive trackpoint distance/time. FIT is the primary stream source; GPX is best-effort.

The server stays stateless: files parsed in memory, response returned, nothing persisted server-side (Privacy Proxy architecture unchanged).

### Client storage (slice 2)

- Summary + provenance live on the session entity in `bh_sessions`: new optional fields `source: 'garmin'`, `startTime`, `summary`. `origin` semantics untouched (imported sessions use existing origin values; `source` is orthogonal provenance).
- Streams live OUTSIDE the entity store — one localStorage key per session, `bh_stream_<sessionId>` — so the hot `bh_sessions` read/write path never pays the stream weight. Deleting a session deletes its stream key.
- Dedup: exact `startTime` match against existing `source: 'garmin'` entities → file skipped, counted in the result toast ("3 imported, 1 already known").

### Upload entry point (slice 2)

"Upload workout" affordance in the Training Plan view (Session Drawer region, exact placement per implementer's judgment matching existing drawer patterns). Multi-file input, `.fit`/`.gpx`. In slice 2, every imported workout becomes a standalone completed session on its actual date (`status: 'completed'`, type via existing `inferSessionType`). All labels EN + DA.

### Calendar matching (slice 3)

On import, if the workout's date has a Planned Session (`status: 'planned'`, not parked):
- Prefer a same-type match; else the earliest unmatched planned session by `dayOrder` (Doubles: two uploads can complete two planned sessions).
- The planned entity is updated in place — `status: 'completed'` plus `source`/`startTime`/`summary` — preserving its id, Coach note, and zone. No duplicate entry is created.
- No planned session on that day → standalone completed session (slice 2 behavior).

Rating chain: after an upload batch, if exactly one imported workout is dated today or yesterday, open the Session Feedback popup for it (`preload: false`), mirroring `simulateWorkoutComplete`. Bulk/backfill imports never chain popups — those sessions are rated from the calendar like any past session. Skipping remains free (never-block-always-assess).

### Information View real data (slice 4)

- `infodata.js` gains dataset state `'mine'` alongside `fresh`/`rich`: same dataset shape, built from `bh_sessions` entities + `bh_stream_*` streams instead of the seeded PRNG. This is the seam being exercised, not redesigned — panels and catalog code do not change shape.
- The demo-state toggle offers "My data" only when at least one `source: 'garmin'` session exists; synthetic states remain for demos.
- Wearable-gated collections (zones, peaks, bests) populate from real streams when the channel exists; a channel absent from all uploads keeps its gated panels unrendered (one-reading rule unchanged).
- Zones placeholder: %-of-observed-max-HR bands, clearly a POC stand-in — real zones come from field tests via the future calc module (round-2 expert ruling). Flag in code comment.

### Benched metrics stay benched

hrTSS/rTSS/IF/NGP are NOT part of this route. This route makes the data exist; the calc module (see reference-calculation-sources memory) computes on it later. NGP note for then: TrainingPeaks' exact algorithm is proprietary — implement a documented grade-adjusted-pace model and name it honestly.

## Testing Decisions

Good tests exercise the seams, not the FIT binary format:

- **`poc/garmin.js` pure functions** — `downsampleRecords()`, `summarizeRecords()` (and GPX speed derivation) tested on synthetic record arrays: bin math, absent channels omitted, single-record edge, empty input.
- **Endpoint** — GPX fixture (text, hand-authored, synthetic values per the 2026-07-09 privacy rule) uploaded end-to-end: response carries `startTime`, `summary`, `streams`. FIT mapping tested at the record-mapping seam with fixture record arrays; authoring a binary FIT fixture is not worth it.
- **Store/matching** — jsdom via exported handlers (calendar-route convention): dedup table, match-preference table (type match / dayOrder / Double / no-planned), rating-chain rule (one recent vs bulk).
- **Provider `'mine'`** — dataset-shape parity with `fresh`/`rich` (same invariant tests run over all three states), oldest→newest ordering invariant (the reversed-array bug class), gated collections absent when no channel data.
- **Manual verification (Mads)** — export a real activity from Garmin Connect, upload, confirm: calendar completion, rating popup, streams in localStorage, real panels. Real-data screenshots stay out of git (privacy rule).

## Out of Scope

- Live Garmin API (V1 — revisit when the developer program reopens; application requires company entity + privacy policy)
- Strava (permanently ruled out, see Route decision)
- hrTSS/rTSS/IF/NGP and any derived physiology metrics (post-calc-module)
- Automatic re-planning when an uploaded workout deviates from the plan (Coach reacts at the Weekly Session via existing Week Activity mechanism)
- Wahoo/Polar/Suunto native formats beyond .fit/.gpx
- IndexedDB migration — 10 s downsampling keeps months of sessions inside the localStorage budget; revisit only if real usage hits the wall

## Further Notes

The columnar 10 s stream format is the contract the future calc module consumes; changing it later means re-import, so it is deliberately minimal and channel-sparse. The official Garmin API at V1 delivers FIT files via webhook push — those flow into `poc/garmin.js` exactly like an upload, which is why this route is the stepping stone and not a detour.
