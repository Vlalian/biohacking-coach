Status: done

# 03 — Chat Detection of Constraints with Clarifying Question

## Parent

`.scratch/coach-constraint-memory/PRD.md`

## What to build

Update the Coach system prompts (Weekly Session and Coach Chat) to detect constraint statements from the athlete and handle them automatically.

When the athlete says something like "I can't train Thursday" or "I'm travelling next week":
- If the scope is clear from context (specific date mentioned), the Coach acknowledges it and the frontend stores it as an unavailable date in localStorage
- If the scope is ambiguous ("I can't do Tuesdays" — this week? always?), the Coach asks exactly one clarifying question: "Do you mean this coming Tuesday, or every Tuesday from now on?"
- Based on the athlete's answer, either a single-instance unavailable date is stored, or the constraint is added to the athlete's fixed constraints (pending the fixed constraints implementation in issue 01)

This is primarily a prompt change. The frontend must handle a new structured response field that signals a detected constraint so it can update localStorage without the athlete manually tapping the calendar.

The Coach never demands justification for a constraint — it acknowledges and incorporates it.

## Acceptance criteria

- [ ] When the athlete mentions a specific unavailable date in any conversation, the Coach acknowledges it and the date is marked as unavailable in localStorage
- [ ] When the constraint is ambiguous (day of week without scope), the Coach asks exactly one clarifying question
- [ ] After the athlete clarifies "this week" → single-instance unavailable date is stored
- [ ] After the athlete clarifies "every week" → handled as a fixed constraint (stored in profile if issue 01 is complete, or stored as a repeated single-instance if not)
- [ ] The Coach does not ask for a reason or justification for the constraint
- [ ] The detected constraint appears in the calendar with the unavailable visual treatment

## Blocked by

None — can start immediately.
