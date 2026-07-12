Status: ready-for-agent
Route position: 6 of 8 (Calendar Implementation Route)

# 05 — Rest dominance (Displacement)

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

The Displacement rule, end-to-end: Rest is dominant and never displaced. Dropping a Rest block onto a day with training flips that training to unavailable in place, badged as parked. Dropping training onto a Rest day parks the incoming session as unavailable on that day. When a Rest block later leaves a day, that day's parked sessions automatically return to planned (the auto-restore sweep); a parked session moved elsewhere by the athlete also revives. Parked state is visually distinct on both blocks and dots, and the Session Drawer explains it in plain language.

**Copy ruling (round-2 expert, 2026-07-12):** absolute Rest protection stays as the default — right for this app's age-grouper audience — but the rule is level-dependent, not a law of training (light work on recovery days is normal at higher levels). All Displacement copy explains what happened and why, and never moralises ("rest is sacred"-style framing is out).

## Acceptance criteria

- [ ] Pure-rule tests cover all Rest conflict cells: rest-onto-training, training-onto-rest, rest-onto-rest (no-op), multi-occupant days
- [ ] Rest dropped on a training day parks every training session on it; the Rest lands active
- [ ] Training dropped on a Rest day lands parked; the Rest is untouched
- [ ] Moving the Rest away auto-restores that day's parked sessions to planned
- [ ] Moving a parked session to a free day revives it to planned
- [ ] Parked blocks are visually badged; the drawer states why the session is unavailable in plain, non-moralising language
- [ ] Orchestrator story test: park → Rest leaves → auto-restore, in one flow

## Blocked by

`.scratch/draggable-calendar/issues/04-within-week-session-move.md`
