Status: ready-for-agent

# 06 — Cross-Week Move + Move Checkpoint

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

Moving a session to a day in a different week (Mon–Sun boundary) becomes possible and is classified as a Cross-Week Move. Drop targets include day cells of collapsed week rows, so the target week never needs expanding.

The athlete's first two *completed* Cross-Week Moves trigger the Move Checkpoint: a modal in the Coach's voice (static copy) explaining the downside of shifting load across weeks, with an optional comment field and Move / Don't move buttons. Cancelling does not count against the limit. From the third completed move on, cross-week drops land without friction. Every Cross-Week Move is logged flagged as cross-week, with the comment (the Pushback Rationale) attached when given. All Displacement and Double rules apply unchanged at the target day.

## Acceptance criteria

- [ ] Pure tests: week-boundary classification (including month-boundary weeks) and the completed-moves-only checkpoint counter
- [ ] First two completed cross-week drops show the checkpoint; cancel leaves everything unchanged and doesn't count
- [ ] Comment entered in the checkpoint is stored on the move's log entry
- [ ] Third and later cross-week moves apply instantly, still logged and flagged
- [ ] Drops onto collapsed week day cells work; Displacement/Double resolution applies at the target
- [ ] DOM tests: checkpoint renders on cross-week drop, both buttons behave; translation-key tests for checkpoint copy

## Blocked by

`.scratch/draggable-calendar/issues/04-within-week-session-move.md`
