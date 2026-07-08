Status: done

# 02 — Weekly Session: plan-first prompt order

## Parent

`.scratch/expert-feedback-poc-updates/PRD.md`

## What to build

Update the Weekly Session system prompt in `buildWeeklyContext` (server-side) so that the Planning phase proposes the week plan before asking the athlete about their schedule or constraints.

Current behaviour: the Coach asks the athlete about their week's constraints and availability before building or presenting the plan. The athlete has to declare constraints into a void before seeing what's being proposed.

Target behaviour: the Coach opens the Planning phase with a direct proposal — "Here's what I'm thinking for next week: [session types and rough load]. Does that work, or is there anything that needs moving?" The athlete reacts to a concrete plan rather than pre-filling a constraint form.

This is a prompt-only change. No schema changes, no new routes, no localStorage changes. The Planning phase instruction block in `buildWeeklyContext` is rewritten to reflect the correct order: propose → ask if it fits → adjust.

The Coach's tone in the proposal should match Peer Authority: direct and concrete ("Here's the plan"), not tentative ("I was thinking maybe…"). The follow-up question should be genuinely open ("Does that work for your week? Anything that needs moving?") — not a checklist of constraint categories.

## Acceptance criteria

- [ ] Running a Weekly Session, the Coach's Planning phase opens with a plan proposal before asking any questions about the athlete's schedule
- [ ] The proposal is concrete (mentions session types and/or rough load) rather than abstract
- [ ] After the proposal, the Coach asks a single open question about whether it fits
- [ ] If the athlete says something doesn't fit (e.g. "I'm travelling Thursday"), the Coach adjusts and re-proposes
- [ ] The Coach does not ask "do you have any travel or work commitments this week?" before presenting the plan

## Blocked by

None — can start immediately.
