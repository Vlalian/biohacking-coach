# Refresh the POC README to the Weekly Session era

Label: wayfinder:task
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: 01
Map: ../MAP.md

## Question

poc/README.md is titled "Session Negotiation POC" and claims to demonstrate features removed on 2026-06-26 (Pushback Rationale log, `getRecommendation` flow, conversational Session Reflection — see `.scratch/deleted-session-negotiation.md`). Per CONTEXT.md, the Weekly Session replaced daily Session Negotiation as the primary loop, and Session Reflection is now two RPE ratings, not a conversation.

Rewrite the README against the *actual current code* (server.js, public/js/): title, "What it demonstrates", persona table (verify it still matches use-me), and "Next increments". Read the source, don't trust the old list. Resolution records what the POC currently demonstrates — that list is itself useful ground truth for the drift-audit fog on the map.

## Resolution

Done 2026-07-08. [poc/README.md](../../../poc/README.md) rewritten from source (server.js, all of public/js/, package.json, tests).

**What the POC actually demonstrates now** (ground truth for the drift-audit fog): Weekly Session with a per-session-number arc (1 = first meeting + orientation send-off, 2–3 = picture-building with declared uncertainty, 4+ = Reflective Prompt opening); structured plan extraction onto the Training Plan monthly calendar (dots, day expansion, month nav, narrative panel, tap-to-discuss via the surviving `/api/negotiate` endpoint); RPE Session Reflections; Coach Chat; MCQ onboarding with experience-adaptive branching and Garmin .fit/.gpx upload; silent pattern detection with surfacing rules; constraint memory via `[UNAVAILABLE]`/`[FIXED_CONSTRAINT_*]` signals; per-persona Tone Adaptation; Danish support; Equipment/Glossary/Settings views. Persona table verified against personas.js — names, session counts, phases all match; "Tests" column replaced with comm-style gists. Old "Next increments" (Pattern Insight, Trajectory Projection) dropped: Pattern Insight is implemented; Trajectory Projection was removed with Session Negotiation. A **History** section records the Session Negotiation retirement so the old title doesn't just vanish.

**Two adjacent truth fixes** (same misleading-surface spirit): the server startup log claimed `ANTHROPIC_API_KEY` env var works — no route reads it; line now says UI-only. package.json description still said "Session Negotiation POC" — updated.

**Verification**: `npm test` — 27/31 pass. The 4 failures are pre-existing (jsdom lacks `scrollIntoView`, called unguarded at conversation.js:163) and untouched by these edits; ticketed as [Make npm test pass out of the box](08-make-npm-test-pass-out-of-the-box.md).
