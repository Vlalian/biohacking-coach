Status: done

# 04 — Eliminate LLM Extraction, Build Profile Directly from MCQ

## Parent

`.scratch/mcq-onboarding/PRD.md`

## What to build

Remove the `/api/onboard/extract` endpoint and the client-side call to it. The athlete profile is now constructed entirely client-side from the MCQ responses collected in issues 01–03. No LLM call is made during profile construction.

The `commStyle` field (coaching instruction string) is the one field that benefits from a brief LLM generation — but it is now driven by structured inputs (experience level + communication signals from clarifying questions), not a free conversation transcript. A short, targeted LLM call may remain for `commStyle` generation only.

The onboarding conversation endpoint (`/api/onboard`) is also removed — there is no ongoing free-form conversation in the new flow. The server retains only the `commStyle` generation endpoint if needed.

The Coach's opening greeting on the athlete's first session is generated from the completed structured profile, not from an onboarding conversation history.

## Acceptance criteria

- [ ] Completing MCQ onboarding does not make a call to `/api/onboard/extract`
- [ ] The athlete profile in localStorage is fully populated from MCQ responses alone
- [ ] `experienceLevel` is always exactly `beginner`, `intermediate`, or `veteran` — never misclassified
- [ ] The first Coach session (daily or weekly) opens with a contextually appropriate greeting derived from the structured profile
- [ ] No onboarding conversation history is stored or passed to Coach sessions
- [ ] If `commStyle` generation uses an LLM call, it is driven by structured fields, not a transcript

## Blocked by

`.scratch/mcq-onboarding/issues/01-mcq-flow-core-fields.md`
`.scratch/mcq-onboarding/issues/02-experience-adaptive-questions.md`
`.scratch/mcq-onboarding/issues/03-profile-fields-constraints-and-day.md`
