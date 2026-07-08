Status: done

# 01 — MCQ Flow Scaffold with Core Fields

## Parent

`.scratch/mcq-onboarding/PRD.md`

## What to build

Replace the free-form onboarding conversation with a structured MCQ flow. The new flow is a sequence of screens (not a chat) that collects the core athlete fields via buttons and short text inputs. The existing onboarding conversation UI is replaced; the Coach is not involved in this step.

Core fields collected in this issue:
- **Name** — short text input
- **Language preference** — button selection: Dansk / English
- **Experience level** — button selection: "My first Ironman" / "2–4 races" / "5+ races" (maps to `beginner` / `intermediate` / `veteran`)
- **Race target** — text input for race name + approximate date

On completion, these four fields are written directly to localStorage as athlete profile fields — no LLM call. The existing `bh_onboarded` flag is set to `true` and the app launches.

The experience-adaptive clarifying questions, constraint fields, and LLM extraction elimination are handled in subsequent issues. This issue establishes the MCQ scaffold that later issues extend.

## Acceptance criteria

- [ ] Onboarding presents a structured screen flow instead of a chat conversation
- [ ] The athlete selects their experience level via buttons (not typed text)
- [ ] Experience level is stored correctly as `beginner`, `intermediate`, or `veteran` in localStorage — no LLM extraction
- [ ] Language preference is stored in localStorage
- [ ] Name and race target are stored in localStorage
- [ ] `bh_onboarded` is set and the app launches after completion
- [ ] The flow is completable without typing anything beyond name and race target

## Blocked by

None — can start immediately.
