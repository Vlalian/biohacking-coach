Status: done

# 01 — Pass race target into weekly prompt

## Parent

`.scratch/new-athlete-experience/PRD.md`

## What to build

Wire `raceTarget` through from the MCQ state into the Week 1 weekly session prompt, so the Coach can name the race when building the first week's plan.

The flow is: `readCheckIn()` (app.js) → `startWeeklySession()` call → `buildWeeklyContext()` (server.js) → `renderWeeklyPrompt()`.

`raceTarget` is already stored in `bh_athlete_profile` by the MCQ. It just needs to be read in `readCheckIn()` and forwarded through the chain.

The Week 1 prompt instruction should use `raceTarget` to allow the Coach to name the race when framing the first week — e.g., when closing the first session plan with "This is your starting point toward Copenhagen 70.3." The instruction must explicitly say **not** to use the race name as a greeting or "I look forward to helping you stand tall at [race]" — that phrasing belongs to the MCQ completion screen (Issue 02), and repeating it here would feel redundant. The race name should appear in context, not as a repeated welcome.

Weeks 2+ do not need `raceTarget` in the prompt — they rely on accumulating feedback and history, not the goal statement.

## Acceptance criteria

- [ ] `readCheckIn()` returns `raceTarget` read from `bh_athlete_profile`
- [ ] `buildWeeklyContext()` destructures and forwards `raceTarget`
- [ ] Week 1 arc in `renderWeeklyPrompt()` includes `raceTarget` and instructs the Coach to reference the race name contextually (not as a repeated greeting)
- [ ] Week 4+ arc does not include `raceTarget` (it is not relevant there)
- [ ] `raceTarget` field is absent or `undefined` if the athlete has not completed the MCQ — the prompt degrades gracefully (no broken template literal)

## Blocked by

None — can start immediately.
