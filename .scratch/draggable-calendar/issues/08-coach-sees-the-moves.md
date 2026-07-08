Status: ready-for-agent

# 08 — The Coach sees the moves

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

The move log reaches the Coach. The client sends the week's Session Move log (and Athlete Session creations) with the Weekly Session request; the server injects it into the Weekly Session system prompt as coaching context. Cross-Week Moves are flagged distinctly, with the athlete's checkpoint comment attached when one was given, so the Coach raises them during the session — consistent with "context is gathered at the next Weekly Session, not in the moment." Within-week moves and creations arrive as silent background context (Pattern Insight material), which the prompt instructs the Coach never to challenge in the moment.

## Acceptance criteria

- [ ] Weekly Session request carries the current week's move log and creation log
- [ ] System prompt contains cross-week moves flagged with from/to days and comments
- [ ] Within-week moves and Athlete Session creations appear as background context with the no-challenge instruction
- [ ] Empty log → no move section in the prompt
- [ ] Server prompt tests (existing seam) cover all of the above

## Blocked by

`.scratch/draggable-calendar/issues/06-cross-week-move-checkpoint.md`
