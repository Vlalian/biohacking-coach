Label: wayfinder:grilling
Status: ready-for-human

# Reconcile `display_name` with ADR 0006's identity separation

Map: ../MAP.md

## Question

Two signed-off decisions contradict each other, and slice 01 has already built one of them.

[ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md) makes **identity separation** structural, and stakes the privacy posture on it:

> login identity (name, email) lives in better-auth's tables while all training data is keyed by an opaque athlete ID, **so a leak of the training data alone names no one**

> The schema must enforce identity separation structurally: better-auth user rows link to athlete rows via opaque ID; **training tables never carry email or name columns**.

[Ticket 05](05-server-data-model.md)'s signed-off schema puts `display_name` (athlete-chosen) on `athlete` — the anchor row every training table keys off. Slice 01 built it, the seed writes `Mads` into it, and the page renders it. **So ADR 0006's claim is currently false**: a dump of `athlete` names him.

Surfaced by a code review of slice 01 (2026-07-16). Both reviewers were right, which is the point — the spec review found the schema matches ticket 05 column-for-column, the standards review found it breaches ADR 0006. The documents disagree; the code cannot honour both.

## What to decide

- **Is `display_name` identity?** Ticket 05 calls it *athlete-chosen*, which reads as a handle, not a legal name. A handle an athlete picks for themselves is arguably not what ADR 0006 means by "name". But the eval's only real athlete chose "Mads", so the distinction is theoretical here and the ADR's promise is what breaks.
- **If it stays on `athlete`:** ADR 0006's wording needs amending — the honest claim becomes "a leak of training data alone names no one *unless the athlete chose to be named*", which weakens the disclosure the consent artifact rests on. Say so plainly rather than leaving prose that overpromises.
- **If it moves:** it belongs behind the `user_id` seam in better-auth's tables, which means synthetic athletes (no user) need a label from somewhere — they have no user row to hold one. That is the case that made ticket 05 put it on `athlete` in the first place.
- **A third option:** keep the column, seed a non-identifying handle. Costs nothing, keeps the ADR's promise true, and the eval's athlete is Mads either way — he knows who he is.

## Why it matters before slice 06

[Slice 06](../../eval-mvp-build/issues/06-garmin-upload-lands-real-data.md) is where real Garmin data first lands on hosted infrastructure. The [eval-MVP PRD](../../eval-mvp-build/PRD.md) already gates that on the GDPR posture. This question is part of that gate: the consent artifact will describe what a leak would expose, and it cannot describe it correctly while the schema and the ADR disagree.

Cheap now — one table, one migration, one row. Expensive once eleven tables key off it.

## Blocked by

None. Likely resolved alongside the route's **GDPR posture** item (see MAP.md, Not yet specified) — the consent artifact depends on the answer.
