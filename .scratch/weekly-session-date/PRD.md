Status: ready-for-agent

# PRD — Weekly Session Date

## Problem Statement

The Weekly Session always plans for "next Monday" regardless of what day it is today. An athlete who runs their Weekly Session on a Monday is told to plan for the following Monday — seven days away — rather than the current week they are about to live. This makes the Weekly Session feel misaligned with the athlete's actual training rhythm.

## Solution

Replace the fixed "next Monday" logic with a day-sensitive calculation: if today is Monday, plan from today; if mid-week, plan the remaining days of the current week. Additionally, surface the athlete's preferred Weekly Session day during onboarding as a MCQ field, and store it in the profile to inform the logic going forward.

## User Stories

1. As an Ironman trainee who does my Weekly Session on Monday, I want the Coach to plan for this week — starting today — so that the session is immediately actionable.
2. As an Ironman trainee who does my Weekly Session mid-week, I want the Coach to plan for the remaining days of this week so that the plan covers what is actually ahead of me.
3. As an Ironman trainee, I want to tell the Coach when I typically do my Weekly Session during onboarding so the app can adapt its planning horizon to my rhythm.
4. As an Ironman trainee, I want my preferred Weekly Session day stored in my profile so I don't have to re-state it every week.

## Implementation Decisions

### Week start calculation

The current `getNextMondayKey()` function (used in `conversation.js`) is replaced with a `getWeekStartKey(today)` function that:

- If `today` is Monday → returns `today`
- If `today` is any other day → returns the date of the most recent Monday (start of current week)

The planning horizon passed to the Coach prompt is then "from today through Sunday of the current week" rather than a fixed 7-day block starting next Monday.

### Onboarding MCQ field

A new field is added to the MCQ onboarding flow: "Which day do you typically do your Weekly Session?" (e.g. Monday / Wednesday / Sunday / Flexible). The selected value is stored in the athlete profile as `weeklySessionDay`.

This field informs the planning horizon calculation: if the athlete's preferred day is Wednesday and today is Wednesday, the app knows this is the intended Weekly Session day and plans accordingly.

For the POC, the day-sensitive calculation is sufficient. The `weeklySessionDay` preference is stored but the planning horizon calculation may not yet consume it — the day-sensitive default covers the common case.

### Prompt update

The system prompt passed to the Coach in the Weekly Session must reflect the updated planning horizon — "for the remaining days of this week" rather than "for next week."

## Testing Decisions

Good tests verify the output of the week-start calculation directly, not the internal date arithmetic.

**Seam:** `getWeekStartKey(date)` function. Given a Monday date, returns that date's ISO string. Given a Wednesday date, returns the ISO string of the Monday of that week.

Manual verification: run a Weekly Session on a Monday, confirm the Coach plans for the current week. Run on a Wednesday, confirm remaining days of the current week.

## Out of Scope

- Showing a different number of days in the plan depending on mid-week start (e.g. only 3 sessions instead of 5) — the Coach handles this conversationally
- Rolling the plan into next week if the current week has too few days remaining — not needed for POC
- User-configurable week start day (e.g. Sunday-start weeks)

## Further Notes

The `weeklySessionDay` onboarding field also serves as a natural prompt for the Coach to ask "shall I plan for this week or next week?" if the athlete's preferred day does not match today — a conversational fallback for edge cases the logic cannot handle automatically.
