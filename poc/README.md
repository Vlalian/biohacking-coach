# Biohacking Coach App — POC

Working prototype of the Coach experience: the **Weekly Session** loop, the **Training Plan** calendar, and **Coach Chat**, backed by a thin Express server that renders Coach prompts and calls the Anthropic API.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000. Enter your Anthropic API key in the UI — it's sent only to your local server, never stored. `COACH_MODEL` env var overrides the model (default `claude-sonnet-4-6`).

Tests: `npm test` (vitest — prompt rendering, onboarding completion, conversation buttons, translations).

## What it demonstrates

**The Weekly Session** — the primary ritual (Check-in → Review → Planning), with a session-number arc: session 1 is a first meeting (no faked familiarity, first-week orientation send-off), sessions 2–3 build the athlete picture with declared uncertainty, session 4+ opens with a Reflective Prompt before the Coach gives its read. Ends by extracting the agreed week as structured sessions onto the calendar.

**Training Plan calendar** — monthly grid with colour-coded session dots (type + completed/planned/skipped status), day expansion, month navigation, and a Coach narrative panel. Tapping a session opens a discussion where the Coach walks through its rationale. Sessions can be marked complete or skipped.

**Session Reflection** — two RPE 1–10 ratings (Body and Mind) plus optional comment, captured via a fast popup on completion and editable from the calendar. Accumulated feedback feeds the next Weekly Session's review.

**Coach Chat** — on-demand open conversation (training, nutrition, equipment, injury, mindset) with silent athlete context.

**MCQ Onboarding** — structured profile capture with experience-adaptive branching, plus Historical Data Upload: Garmin `.fit`/`.gpx` files parsed server-side into training history (last 6 months).

**Coach intelligence** — Peer Authority posture (evidence → recommendation → genuine question); Declared Uncertainty when check-in signals conflict; silent pattern detection over session history (sleep/intensity pushbacks, elevated pulse, mood/sleep correlation) that shapes recommendations without surfacing as data; constraint memory via `[UNAVAILABLE:...]`/`[FIXED_CONSTRAINT_...]` signals the Coach appends and the app strips.

**Tone Adaptation** — per-athlete Communication Style injected into every prompt; Danish language support (sports terms stay in English).

Plus: Equipment tab (kit referenced by the Coach when relevant), Glossary, Settings (language, preferred Weekly Session day, no-training days), localStorage persistence.

## Test personas (from the use-me skill)

| Persona | Sessions | Phase | Experience | Comm style |
|---------|----------|-------|------------|------------|
| Sarah Chen | 2 | Early Base Building | beginner | warm, plain language, normalise uncertainty |
| Thomas Eriksen | 47 | Taper | veteran | terse, data-dense, technical terms |
| Marcus Okafor | 8 | Return to Training | veteran | injury-aware, logic-first, calm confidence |
| Emma Larsen | 23 | Off-season Maintenance | veteran | analytical, reasoning-first |

History scenarios (sleep-intensity, pulse-pushback, mind-sleep, no-pattern) simulate session history to exercise pattern detection.

## History

Daily **Session Negotiation** was the original core loop; it was retired as the primary interaction in June 2026 when the Weekly Session replaced it (see CONTEXT.md). The `/api/negotiate` endpoint survives, repurposed for tapped-session discussions from the calendar.
