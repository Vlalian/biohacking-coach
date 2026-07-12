Status: ready-for-agent
Route position: 8 of 8 (Calendar Implementation Route)

# 08 — The Coach sees the moves

## Parent

`.scratch/draggable-calendar/PRD.md`

> Simplified 2026-07-12: the Cross-Week Move and Move Checkpoint were retired before build ([issue 06](06-cross-week-move-checkpoint.md)), so there is no cross-week flagging and no checkpoint comment. Session references follow the natural-reference convention from [Decide the Coach-facing session identity](../../calendar-implementation-route/issues/04-decide-coach-facing-session-identity.md).

## What to build

The move log reaches the Coach. The client sends the week's Session Move log and Athlete Session creations with the Weekly Session request; the server injects them into the Weekly Session system prompt as silent background context (Pattern Insight material), which the prompt instructs the Coach never to challenge in the moment — consistent with "context is gathered at the next Weekly Session, not in the moment."

All moves are within-week. Log entries render as **natural references** — date + type ("moved Wed 2026-07-15 Recovery to Fri"), adding the position ("2nd Endurance") only when two same-type sessions share a day. Entity ids never appear in prompts.

## Acceptance criteria

- [ ] Weekly Session request carries the current week's move log and creation log
- [ ] Moves and Athlete Session creations appear in the system prompt as background context with the no-challenge instruction
- [ ] Log entries use natural references; the position qualifier appears only for same-type Doubles; no entity ids in the prompt
- [ ] Empty log → no move section in the prompt
- [ ] Server prompt tests (existing seam) cover all of the above

## Blocked by

`.scratch/draggable-calendar/issues/04-within-week-session-move.md`, `.scratch/draggable-calendar/issues/07-athlete-sessions-retro-log.md`
