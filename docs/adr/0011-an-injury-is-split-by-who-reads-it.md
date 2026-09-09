# An injury record is split by who reads it, not by who wrote it

An injury is held in two halves: a structured, athlete-authored statement of **what it prevents** ("can't run", "can ride easy, not hard"), which is the only half a Coach prompt ever sees; and a free-text **detail thread**, written by the athlete and the Head Coach together, which is documentation for humans and never enters a prompt. The Coach plans around capacity and never infers it from body location — that leap is a clinical inference, and the Coach's remit is working around an injury, never diagnosing one.

## Why

Three existing decisions converge on this, and none of them survives the simpler design where the AI reads everything.

**The posture ruling** (`.scratch/knowledge-oracle/corpus.md`) already fixed the Coach's remit: prevention, load management, training modification and graded-return *principles* are IN; diagnosis, treatment, rehabilitation protocols and imaging are OUT. The corpus deliberately holds nothing that would tempt it across that line. A free-text clinical note in the prompt is exactly that temptation, supplied by us.

**The consent does not cover it.** `health_data` asks the athlete to let the app process "the signals you report about your body — sleep, energy, how a session felt, resting pulse", hedged as signals that *can reveal* health information. An injury description is health information stated outright, not inferred from training signals. And ADR 0003's own amendment already lists "no consent purpose covers being seen by a Head Coach" as an unmet pre-launch item — an injury thread with Head Coach comments lands on both gaps at once.

**There is a standing precedent.** `narration.ts` refuses to send a Head Coach's session note to the model, because the sentence lands in the Coach Chat transcript and `toApiMessages` replays that transcript on every later turn — so one note sits in front of the model for the rest of that athlete's history. An injury thread is that same hazard carrying special-category data.

## Consequences

- A Head Coach's clinical knowledge does **not** automatically steer the AI. When they want it to, they write a **Coaching Directive** — "watch her Achilles this block" — which is that mechanism, already designed, already Head-Coach-authored, already deliberately not shown raw to the athlete.
- The planner reads capacity per discipline, so it can substitute rather than cancel: a running injury reshapes a week rather than emptying it.
- The human model in the calendar is a *view*, not a source of truth. It can ship whenever — the data underneath is already the right shape without it.
- **Still unresolved and blocking a real second user:** the consent wording for explicit injury data, and a purpose covering Head Coach visibility. Both are pre-existing gaps this decision surfaces rather than creates; neither is settled here, and neither is an agent's to settle.
