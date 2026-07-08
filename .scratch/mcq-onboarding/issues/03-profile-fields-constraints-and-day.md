Status: done

# 03 — Profile Fields: Fixed Constraints and Weekly Session Day

## Parent

`.scratch/mcq-onboarding/PRD.md`

## What to build

Add two fields to the MCQ onboarding flow (as a final screen before completion):

**Fixed unavailable days** — "Are there days you can never train?" — day-of-week checkboxes (Monday through Sunday). Multiple selection allowed. "None" is always valid. Stored as `fixedConstraints: ["Tuesday", "Saturday"]` in the athlete profile.

**Preferred Weekly Session day** — "Which day do you typically do your weekly planning session?" — button selection: Monday / Wednesday / Friday / Flexible. Stored as `weeklySessionDay` in the athlete profile.

These fields feed into the Coach Constraint Memory and Weekly Session Date features. Both are optional — skipping them leaves the fields empty, and the Coach falls back to asking during the first Weekly Session.

## Acceptance criteria

- [ ] Onboarding includes a screen with day-of-week checkboxes for unavailable days
- [ ] Multiple days can be selected; none is a valid selection
- [ ] `fixedConstraints` is stored correctly in localStorage (array of day names)
- [ ] Onboarding includes a Weekly Session day preference selection
- [ ] `weeklySessionDay` is stored correctly in localStorage
- [ ] Both fields are optional — the flow completes normally if skipped

## Blocked by

`.scratch/mcq-onboarding/issues/01-mcq-flow-core-fields.md`
