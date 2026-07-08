Status: done

# PRD — Coach Constraint Memory

## Problem Statement

The Coach forgets constraints between sessions. An athlete who says "I can't train on Tuesdays" in one Weekly Session has to repeat this in every subsequent session. There is no mechanism for fixed recurring constraints to persist in the athlete's profile, and no mechanism for single-instance constraints (e.g. "I'm travelling next week") to be captured and surfaced automatically.

## Solution

Three constraint capture mechanisms feeding into one persistence model:

1. **Fixed constraints via MCQ onboarding** — athletes declare recurring unavailable days during setup. Stored in profile, included in every Coach session prompt.
2. **Chat detection** — when an athlete mentions a constraint in any conversation, the Coach detects it, asks one clarifying question if the scope (this week / always) is ambiguous, and marks the relevant calendar day(s) automatically.
3. **Manual calendar marking** — athletes can tap a day in the Training Plan calendar and mark it as "unavailable" directly, without opening a conversation.

Single-instance constraints (specific dates) are passed to the next Weekly Session and discarded after. Fixed constraints persist in the profile indefinitely and can be updated via Coach Chat.

## User Stories

1. As an Ironman trainee, I want to declare recurring unavailable days during onboarding so the Coach always knows my weekly constraints without me re-stating them.
2. As an Ironman trainee, I want fixed constraints stored in my profile so they persist across all sessions automatically.
3. As an Ironman trainee, I want to update my fixed constraints by telling the Coach in a conversation so I don't have to find a settings screen.
4. As an Ironman trainee who says "I can't train Thursday next week" in a Weekly Session, I want the Coach to capture that automatically and reflect it in the week plan — without me having to mark it manually.
5. As an Ironman trainee, I want the Coach to ask a clarifying question ("do you mean this Thursday, or every Thursday?") if my constraint statement is ambiguous, so the right type is stored.
6. As an Ironman trainee, I want to mark a specific day as unavailable directly in the Training Plan calendar so I can block it without starting a conversation.
7. As an Ironman trainee, I want single-instance constraints to disappear automatically after the relevant week so my calendar doesn't accumulate stale blocks.
8. As an Ironman trainee, I want the Coach to incorporate my constraints into the week plan without me having to remind it during the Weekly Session.

## Implementation Decisions

### Fixed constraints in profile

A `fixedConstraints` field is added to the athlete profile (array of day names, e.g. `["Tuesday", "Saturday"]`). Collected during MCQ onboarding via a question: "Are there days you can never train?" with day-of-week checkboxes (none is a valid answer).

The `fixedConstraints` array is included in `buildCoachContext` and `buildWeeklyContext` system prompts so the Coach never proposes sessions on blocked days.

Fixed constraints can be updated when the athlete tells the Coach in a conversation. The constraint extraction logic (same as chat detection below) detects "actually I can train Tuesdays now" or "add Fridays to my blocked days" and updates the profile accordingly.

### Chat detection and calendar marking

When the athlete mentions a time-based constraint in any chat turn (Weekly Session or Coach Chat), the system:

1. Detects the constraint mention (prompt-side, not code-side — the Coach is instructed to watch for constraint statements)
2. If the scope is clear from context (e.g. athlete said "I'm away next Thursday the 26th"), marks that specific date as unavailable in the calendar immediately
3. If the scope is ambiguous (e.g. "I can't do Tuesdays"), the Coach asks one clarifying question: "Do you mean this coming Tuesday, or every Tuesday from now on?"
4. Based on the answer, either creates a single-instance unavailable entry (specific date) or updates `fixedConstraints` in the profile

The calendar marking uses the same localStorage structure as skip marking, with a new `unavailable: true` flag keyed by date. The calendar renders unavailable days with a distinct visual treatment (e.g. a crossed-out or greyed cell).

### Manual calendar marking

Planned session expansion panels gain a "Mark as unavailable" action alongside the existing buttons. Clicking it immediately marks that date as unavailable in localStorage. The calendar renders the day as unavailable. An "Undo" option in the expansion panel reverses it.

### Weekly Session context

`buildWeeklyContext` receives both `fixedConstraints` (from profile) and `unavailableDates` (single-instance, from localStorage for the upcoming week). The Coach uses both silently to construct the week plan — no need to surface them conversationally unless the athlete asks.

## Testing Decisions

Good tests verify constraint persistence and prompt inclusion through the seams, not the implementation.

**Seam A — Profile constraints in prompt:** Given a profile with `fixedConstraints: ["Tuesday"]`, the rendered Weekly Session system prompt contains "Tuesday" in the constraints context block.

**Seam B — Single-instance unavailable date:** Given an athlete statement "I can't train this Thursday", the calendar marks Thursday's date as `{ unavailable: true }` in localStorage, and this date appears in the `unavailableDates` array passed to the next `/api/weekly` call.

**Seam C — Manual marking:** Given a tap on "Mark as unavailable" for a calendar day, the day renders with unavailable styling and the entry persists across page reload.

Manual verification is sufficient for the POC.

## Out of Scope

- Phone calendar API integration (iOS/Android) — noted as V1 feature; the manual marking and chat detection cover the POC need
- Constraint conflict detection (e.g. Coach tries to schedule on a fixed constraint day and warns the athlete) — handled implicitly by the prompt receiving constraints before planning
- Recurring single-instance constraints (e.g. "every other Thursday for the next month") — not needed for POC

## Further Notes

The phone calendar API is a natural V1 upgrade path: read busy slots from the device calendar and suggest them as unavailable days. The athlete confirms, and they are stored using the same mechanism as manual marking. The POC's manual mechanism is the same underlying data shape, so the upgrade is additive.

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): all child issues done and feature verified present in the POC. Status set to done.
