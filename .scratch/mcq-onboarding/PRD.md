Status: done

# PRD — MCQ Onboarding Redesign

## Problem Statement

The current onboarding is a free-form conversation where the Coach extracts a structured profile via an LLM extraction call at the end. This has two problems:

1. **Friction**: new athletes face a blank conversation screen with no guidance on what information is needed. It is slow to complete and unpredictable in scope.
2. **Extraction unreliability**: the LLM extraction step misclassifies experience levels and misses fields — most visibly, `experienceLevel` is not saved correctly after onboarding, defaulting to `intermediate` regardless of what the athlete stated.

Real differentiators in Ironman coaching onboarding are not the standard fields — it is the *clarifying questions*. An experienced athlete and a first-timer need completely different follow-up questions. The current free-form conversation does not branch on experience.

## Solution

Replace the free-form onboarding conversation with a structured MCQ (multiple-choice question) flow. Standard fields are collected via explicit UI controls — no extraction needed. The experience level is selected directly by the athlete (not inferred). Clarifying questions follow the experience-level selection and branch based on the answer. Experienced athletes get an optional historical data upload step.

The LLM extraction call (`/api/onboard/extract`) is eliminated. The profile is constructed directly from the MCQ responses.

## User Stories

1. As a first-time Ironman trainee, I want onboarding to be fast so I can get to the app without reading a wall of text.
2. As an experienced athlete, I want the onboarding to ask me smart questions that show the app understands my level, not generic starter questions.
3. As an athlete, I want to select my experience level explicitly so the app does not misclassify me.
4. As an athlete, I want to enter my race target (name and date) in a structured field so I don't have to describe it in natural language.
5. As an athlete, I want the app to ask relevant follow-up questions based on my experience level so my profile is complete without unnecessary steps.
6. As an experienced athlete, I want the option to upload historical training data (.fit / .gpx) during onboarding so the Coach has real context from the start instead of starting from zero.
7. As an athlete, I want to declare my fixed training constraints (unavailable days) during onboarding so the Coach never schedules sessions on those days.
8. As an athlete, I want to state my preferred day for Weekly Sessions during onboarding so the planning rhythm matches my week.
9. As an athlete, I want my language preference set during onboarding so the Coach and UI are in my language from the first interaction.
10. As an athlete, I want my onboarding profile to be complete and accurate so the first Coach session is immediately useful.

## Implementation Decisions

### Flow structure

Onboarding proceeds as a sequence of screens, not a conversation. Each screen collects one or a few related fields via buttons, dropdowns, or short text inputs.

**Core fields (all athletes):**
- Name (short text)
- Language preference (button selection: Dansk / English / other)
- Experience level (button selection: "My first Ironman" / "2–4 races" / "5+ races")
- Race target: name (short text) + approximate date (month/year picker or text)
- Fixed unavailable days (day-of-week checkboxes, optional)
- Preferred Weekly Session day (button selection: Monday / Wednesday / Friday / Flexible)

**Experience-adaptive clarifying questions (branching on experience level):**

*Beginner ("My first Ironman"):*
- What's your current sport background? (Runner / Cyclist / Swimmer / Gym / None)
- How many hours per week do you currently exercise?
- What is your main motivation? (Completion / Personal challenge / Community / Performance)

*Intermediate (2–4 races):*
- What was your best Ironman time?
- What is your weakest discipline? (Swim / Bike / Run)
- Are you working with a human coach? (Yes / No)

*Veteran (5+ races):*
- What is your target time for this race?
- Which metrics do you track? (checkboxes: HR / Power / HRV / Pace / None)
- Historical data upload prompt (see below)

The exact field set for clarifying questions may be revised when the user references a best-in-class onboarding reference app. The structure above represents the established principles; specific fields are adjustable.

### Historical data upload (experienced athletes)

Veteran athletes are prompted with an optional step: "Upload your recent training history (.fit or .gpx files from Garmin, Wahoo, etc.)." This is the Garmin integration entry point. The upload is handled by the same `/api/garmin/upload` endpoint defined in the Garmin Integration PRD.

### Profile construction

The profile object is constructed client-side directly from MCQ responses. No LLM extraction call. Fields map directly: `experienceLevel` = button selection → `'beginner' | 'intermediate' | 'veteran'`; `language` = button selection → `'da' | 'en'`; etc.

The `commStyle` field (coaching instruction string, currently generated by extraction) is replaced with a template derived from experience level + communication signals gathered in clarifying questions. A short LLM call may still be used to generate `commStyle` prose, but it is driven by structured inputs rather than a free conversation transcript — making it reliable.

### Elimination of `/api/onboard/extract`

The extraction endpoint is removed or deprecated. The onboarding conversation endpoint (`/api/onboard`) is also replaced — there is no ongoing conversation during MCQ onboarding. The Coach's opening greeting on the first session is generated from the completed profile, not from an onboarding conversation.

## Testing Decisions

Good tests verify that the MCQ flow produces a correctly shaped profile, not the rendering of each screen.

**Seam:** the completed onboarding flow. Given a user selects "5+ races" for experience and "Tuesday" as unavailable, `localStorage` contains `bca_experienceLevel = 'veteran'` and `bca_fixedConstraints = ["Tuesday"]` — with no LLM extraction call made.

Manual verification: complete the MCQ flow as a beginner, confirm experience level is `beginner` in localStorage and the first Coach session uses beginner framing. Repeat as veteran, confirm veteran framing and historical data upload prompt appeared.

## Out of Scope

- In-app profile editing after onboarding (update fields via settings screen) — V1 feature; Coach Chat can update individual fields in the POC
- Onboarding localisation beyond Danish and English — V1
- Validation of race target dates (e.g. warning if race is only 3 weeks away) — Coach handles this conversationally in the first session

## Further Notes

The experience level bug (not saving correctly after current onboarding) is resolved as a direct consequence of this redesign — the athlete selects their level explicitly and it is stored without interpretation. No separate bug-fix issue is needed.

The `weeklySessionDay` and `fixedConstraints` fields collected here are consumed by the Weekly Session Date and Coach Constraint Memory features respectively. MCQ Onboarding is a prerequisite for both.

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): all child issues done and feature verified present in the POC. Status set to done.
