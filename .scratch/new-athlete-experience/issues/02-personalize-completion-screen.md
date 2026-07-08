Status: done

# 02 — Personalize MCQ completion screen

## Parent

`.scratch/new-athlete-experience/PRD.md`

## What to build

Replace the generic MCQ completion screen with a personalized Coach-voice greeting that acts as the Origin Story Climax — the first moment the athlete feels the coaching relationship is real.

The current completion screen in `mcqFinish()` (onboarding.js) shows a static ✓ with the athlete's name and race target as plain text, then a "Launch Training" button. It reads like a form confirmation, not a coaching relationship starting.

The new screen uses the MCQ state already available at that point (`state.name`, `state.raceTarget`) to render a short, personalized greeting in the Coach's voice — static UI text, no API call. This is the one moment in the product where the race goal is stated directly and warmly: "Hello [Name]. I'm your Coach. Your race is set — let's get to work toward [raceTarget]." The exact copy should feel like a real coach sending you into training for the first time, not a welcome email.

This greeting **owns** the "I look forward to [race]" sentiment. The Week 1 Weekly Session prompt (Issue 01) must not repeat it — it should move straight into coaching mode.

Also: remove `buildOnboardingPrompt()` from server.js. No `/api/onboarding` route exists; the function is dead code and predates the MCQ. Removing it eliminates a misleading code path.

## Acceptance criteria

- [ ] `mcqFinish()` renders a personalized completion screen using `state.name` and `state.raceTarget`
- [ ] The greeting is in the Coach's voice (first-person, direct, warm) — not generic confirmation copy
- [ ] The screen does not make an API call — the greeting is static UI text templated from MCQ state
- [ ] "Launch Training" button still works and navigates to the main app
- [ ] `buildOnboardingPrompt()` is removed from server.js
- [ ] If `state.name` or `state.raceTarget` is missing, the screen degrades gracefully (no broken template, no blank)

## Blocked by

None — can start immediately.
