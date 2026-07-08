Status: done

# 01 — Fixed Constraints in Profile and Prompt

## Parent

`.scratch/coach-constraint-memory/PRD.md`

## What to build

Read the athlete's `fixedConstraints` array from the profile and include it in the system prompts for all Coach sessions (daily session, weekly session, Coach Chat). The Coach uses this context silently — it never proposes sessions on days listed as fixed constraints.

The Coach must also be able to update `fixedConstraints` when the athlete declares a change in conversation ("I can train Tuesdays now" or "add Fridays to my blocked days"). The frontend detects this signal from the Coach response and updates the stored profile accordingly.

## Acceptance criteria

- [ ] An athlete with `fixedConstraints: ["Tuesday"]` never receives a Tuesday session proposal in the Weekly Session plan
- [ ] The `fixedConstraints` array is included in the system prompt for all Coach session types
- [ ] When an athlete says "I can train Tuesdays now", the Coach confirms and `fixedConstraints` is updated in localStorage
- [ ] When an athlete says "add Saturdays to my blocked days", the Coach confirms and `fixedConstraints` is updated
- [ ] An athlete with no fixed constraints sees no change in Coach behaviour

## Blocked by

`.scratch/mcq-onboarding/issues/03-profile-fields-constraints-and-day.md`
