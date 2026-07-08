Status: done

# 02 — Experience-Adaptive Clarifying Questions

## Parent

`.scratch/mcq-onboarding/PRD.md`

## What to build

Extend the MCQ onboarding flow with a second screen of clarifying questions that branch based on the experience level selected in issue 01. Beginner, intermediate, and veteran athletes see different questions.

Beginner ("My first Ironman"):
- Current sport background (button: Runner / Cyclist / Swimmer / Gym / None)
- Weekly exercise hours (button: Under 3h / 3–6h / 6–10h / 10h+)
- Main motivation (button: Completion / Personal challenge / Community / Performance)

Intermediate (2–4 races):
- Best Ironman finish time (text input, optional)
- Weakest discipline (button: Swim / Bike / Run — equal is a valid answer)
- Working with a human coach? (button: Yes / No)

Veteran (5+ races):
- Target time for this race (text input, optional)
- Metrics tracked (checkboxes: Heart Rate / Power / HRV / Pace / None)

All answers are stored in localStorage as part of the athlete profile. The `commStyle` field is derived from experience level + communication signals gathered here (a short LLM call driven by structured inputs, not a full conversation transcript).

## Acceptance criteria

- [ ] Beginner athletes see the beginner question set after core fields
- [ ] Intermediate athletes see the intermediate question set
- [ ] Veteran athletes see the veteran question set
- [ ] Answers are stored in localStorage and included in the athlete profile
- [ ] The clarifying questions screen is skippable — all fields are optional
- [ ] `commStyle` is generated from structured inputs, not from a free conversation transcript

## Blocked by

`.scratch/mcq-onboarding/issues/01-mcq-flow-core-fields.md`
