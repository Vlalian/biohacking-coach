Status: done (2026-07-24) — merged via PR #16. MCQ onboarding writes the Athlete Profile (phase, experience, communication style, race target + profile JSONB).
Label: wayfinder:task

# 09 — MCQ onboarding creates the athlete profile

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The MCQ onboarding flow, rebuilt in React: a new athlete answers the question set and it produces their profile — `training_phase`, `experience_level`, `communication_style`, `race_target`, `training_sessions_per_week`, the `profile` JSONB of answers, and `equipment`. (Column names per [route 07](../../coach-eval-mvp-route/issues/07-schema-names-vs-glossary.md), applied in slice 02.)

The POC's `onboarding.js` (507 lines) and `onboarding.completion.test.mjs` are the specification. It is Coach-voice-only per [ADR 0001](../../../docs/adr/0001-coach-voice-only-guided-tour.md) — onboarding is the Coach talking, not a form wizard with a mascot. Read the ADR before designing the surface.

**Language is chosen here.** The Athlete Language effort set the preference during MCQ onboarding, and ticket 05 placed it on the user (`ui_prefs` JSONB, or better-auth's additional-fields mechanism — a build detail this slice decides). Choosing Danish must switch both the UI and the Coach, immediately, without resetting the profile.

Onboarding is a conversation, so it persists like every other one: `conversations.kind = onboarding` (ticket 05, ballot 4).

The athlete row already exists by this point — slices 01 and 02 created it. This slice fills the profile, it does not invent a second creation path.

## Acceptance criteria

- [ ] A new athlete completes MCQ onboarding and their profile columns are populated
- [ ] The answers persist to `profile` JSONB
- [ ] The flow is Coach-voice-only, per ADR 0001
- [ ] Language is chosen during onboarding and stored with the user
- [ ] Choosing Danish switches the UI and the Coach's language immediately, without resetting the profile
- [ ] The onboarding conversation persists as `conversations.kind = onboarding`
- [ ] An incomplete onboarding can be resumed rather than restarted
- [ ] Tests cover profile completion, resumption, and the language switch

## Blocked by

`.scratch/eval-mvp-build/issues/08-weekly-session-conversation.md`
