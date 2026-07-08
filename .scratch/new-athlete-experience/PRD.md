Status: ready-for-agent

# PRD — New Athlete Experience (Presence Arc & Guided Tour)

## Problem Statement

A new athlete completes onboarding and lands in a product designed for an established coaching relationship. The Weekly Session opens by asking "how did the week feel in your body — any heaviness carrying over?" — but there was no week. The Coach has no history, no feedback, no patterns, yet speaks as if it does. The first session feels generic and impersonal. The athlete has no idea what to do next, what the Training Plan calendar is for, or that they can ask the Coach questions mid-week. The referral promise ("it's like having a real coach") is broken in the first session.

## Solution

A four-stage **Presence Arc** that adapts the Weekly Session posture to the depth of the coaching relationship, combined with a **Guided Tour** delivered entirely through the Coach's voice at the moment the athlete needs each piece of information. No UI overlays, no tooltip tours.

- **Week 1**: The Coach welcomes the athlete, acknowledges it knows them only from onboarding, asks one grounding question, proposes the first week's plan, then orients them to the app (Training Plan, Equipment, Glossary, Coach Chat) naturally in the closing.
- **Week 2**: Opens with "how did the first week go?" — a concrete debrief, not a generic check-in. References what was said in session 1.
- **Week 3**: Still early-relationship framing. Begins referencing specific things from the past two weeks. Declares uncertainty where pattern evidence is thin.
- **Week 4+**: Standard arc — Reflective Prompt, Week Review, Planning, Pattern Insights when earned.

An **Equipment Nudge** fires in sessions 2–3 if the athlete hasn't added any gear, framed as a coaching need rather than a product prompt.

## User Stories

1. As a first-week athlete, I want the Coach to tell me what to do next at the end of our first session, so I don't have to figure out the app on my own.
2. As an athlete mid-week, I want to ask my Coach a question and get an answer that knows my context, so it feels like a real coaching relationship rather than a chatbot.
3. As an athlete who skipped a session, I want to know the plan isn't broken, so I don't feel like I've failed and abandon the week.

## Implementation Decisions

### Already implemented

- **Session counter** (`bh_weekly_session_count` in localStorage): incremented each time the athlete starts a Weekly Session. Passed as `weeklySessionNumber` in the check-in object to the server.
- **Session-aware THREE-PHASE ARC**: `renderWeeklyPrompt` selects one of four arc variants based on `weeklySessionNumber` (1, 2, 3, 4+). Each variant has appropriate Phase 1 / Phase 2 / Phase 3 instructions.
- **First Session Orientation**: Injected at the end of the week 1 prompt, instructing the Coach to orient the athlete to Training Plan, Equipment, Glossary, and Coach Chat in coaching voice — not as a product list.
- **Equipment Nudge**: Injected in the week 2–3 prompt when `buildEquipmentLines(equipment)` returns no lines. One sentence, framed as a coaching need.
- **Shared `buildEquipmentLines(equipment)` helper**: Used by session negotiation, weekly, and chat prompts — replaces three duplicate implementations.
- **Data reset compatibility**: `resetOnboarding()` clears all `bh_` and `bca_` prefixed keys, which includes `bh_weekly_session_count` — the arc resets correctly when the athlete resets all data.
- **US-2 (Coach Chat mid-week)**: Already works — `buildChatPrompt` receives the full check-in object including name, phase, experience level, and equipment.
- **US-3 (skip safety)**: Already works — marking a session as skipped shows no alarm and does not disrupt the remaining Week Plan.

### Remaining gaps

- **`raceTarget` not in weekly context**: The weekly prompt knows the athlete's name and training phase but not the raw race name string. The week 1 opening cannot reference the race by name (e.g., "I look forward to helping you stand tall at Copenhagen 70.3"). `raceTarget` must be added to `readCheckIn()` → `buildWeeklyContext()` → `renderWeeklyPrompt()`.
- **MCQ completion screen is generic**: After the MCQ, the athlete sees a static ✓ screen with their name and race target as plain text, then a "Launch Training" button. No Coach voice, no personalized greeting. The Origin Story Climax — "Hello [Name], I'm your AI Coach. I look forward to helping you finish your goal and stand tall at [Race]" — currently never happens. The completion screen should surface this greeting in the Coach's voice, using MCQ state already available at that point.
- **`buildOnboardingPrompt()` is dead code**: No `/api/onboarding` route exists. This function should either be deleted or repurposed for the completion screen greeting.

### Interface changes

- `readCheckIn()` in `app.js`: add `raceTarget` field read from `bh_athlete_profile`
- `buildWeeklyContext()` in `server.js`: destructure and forward `raceTarget`
- `renderWeeklyPrompt()` in `server.js`: include `raceTarget` in week 1 arc instructions
- `mcqFinish()` in `onboarding.js`: replace static completion text with a personalized Coach-voice greeting using `state.name` and `state.raceTarget`

## Testing Decisions

Tests should verify **observable behaviour through public interfaces**, not prompt text or internal state.

**What makes a good test here**: simulate the athlete's actions (start weekly session N times, add/skip equipment, complete MCQ) and assert on what the Coach is *told* — i.e., inspect the system prompt sent to the API for the presence or absence of the arc-variant text, orientation block, and nudge block. Do not test internal variables.

**Modules to test**:
- `buildWeeklyContext()`: assert `weeklySessionNumber` passes through correctly
- `renderWeeklyPrompt()`: assert week 1 prompt contains orientation block; assert week 4+ does not; assert equipment nudge appears in week 2–3 when equipment is empty and absent when equipment is present
- `readCheckIn()` (after change): assert `raceTarget` is included
- `mcqFinish()`: assert completion screen renders personalized greeting text

## Out of Scope

- UI overlays, tooltips, or arrow-based onboarding tours — see ADR-0001
- A conversational onboarding Coach session (five-question intake) — `buildOnboardingPrompt` predates the MCQ and is superseded by it; any future conversational onboarding is a separate feature
- Resurfacing the Guided Tour for returning athletes who reset and re-onboard (the counter resets correctly; the arc replays naturally)
- Monthly Review Session — V1 feature, not in this PRD
- Progressive Disclosure of advanced features (trend analysis, biometric overlays) — separate feature

## Further Notes

The **Presence Arc** is the implementation of the **Coaching Presence** and **Presence Arc** concepts defined in `CONTEXT.md`. The arc is earned, not simulated — the Coach is honest about limited history in the early sessions, and the quality of coaching deepens as real data accumulates. This is a deliberate product decision (see `CONTEXT.md` → Presence Arc) chosen over simulating familiarity from day one.

The **Guided Tour** principle (Coach voice only) is documented in `docs/adr/0001-coach-voice-only-guided-tour.md`. Any future feature orientation should follow the same pattern: the Coach introduces a feature contextually, once, at the moment the athlete needs it.

The **Week 1 BOOM** (Coach Chat mid-week) depends on the Coach's first session closing actively seeding the habit. If the closing does not name Coach Chat with a concrete example, the athlete will not know to use it, and the engagement signal that drives Coach Engagement Rate will not fire.
