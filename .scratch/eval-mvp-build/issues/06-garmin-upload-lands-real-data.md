Status: ready-for-agent
Label: wayfinder:task

# 06 — A real Garmin file becomes a session with per-sample streams

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

Mads uploads a real `.fit` or `.gpx` file and it becomes a session with `origin: garmin` plus its per-sample streams, persisted in Postgres. This is the slice that makes the eval run on real data rather than fixtures.

**This slice ports real code.** `poc/garmin.js` (243 lines) holds the parsing and mining logic, and three test files — `garmin.test.mjs`, `garmin.mine.test.mjs`, `garmin.import.test.mjs` — encode what it extracts. Port them to TypeScript. The [garmin-sync effort](../../garmin-sync/PRD.md) landed real per-sample streams on-device; this is that data surviving the move to a server.

Brings `session_streams`, keyed by session ID with cascade delete — the session-ID seam from ticket 05's ballot 2. Samples are columnar JSONB (`{t, hr, speedMps, altM, powerW, cadenceRpm}`), which is the calc module's contract even though that module does not exist yet. The seam is what survives every future scale transition; honour its shape now.

Garmin-origin sessions carry provenance: `start_time`, `sport`, and a `summary` JSONB.

Parsing an uploaded file is untrusted input. FIT/GPX **metadata sanitisation** is named in the route's security-hardening item, which is not yet decided — so do not invent a sanitisation policy here. Parse defensively, never interpolate raw file metadata into anything that reaches a prompt, and leave the policy to that ticket.

## Acceptance criteria

- [ ] Garmin `.fit`/`.gpx` parsing is ported to TypeScript with its test files carried across and passing
- [ ] Mads uploads a file and a session appears on his calendar with `origin: garmin`
- [ ] The session's owning athlete is derived from the authenticated server session, never from the upload request
- [ ] Parsing and validation complete before anything is persisted; the session, its `session_streams`, its provenance, and the `garmin_imported` event are written in one transaction
- [ ] `session_streams` exists via migration, keyed by session ID, cascade-deleting with its session
- [ ] Samples persist in the columnar shape `{t, hr, speedMps, altM, powerW, cadenceRpm}`
- [ ] Garmin provenance (`start_time`, `sport`, `summary`) is populated
- [ ] A `garmin_imported` event is recorded
- [ ] A malformed or truncated file fails cleanly with a message, and writes nothing — no orphaned session, streams, or event survives a failure
- [ ] Raw file metadata never reaches a prompt
- [ ] Tests cover parsing, the session+streams write, and the malformed-file path

## Blocked by

`.scratch/eval-mvp-build/issues/04-calendar-renders-real-sessions.md`

## Notes

This is the first slice where **real athlete data** lands on hosted infrastructure. Both the Neon and Vercel DPAs should be concluded before it ships — [route ticket 04](../../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) required exactly this.
