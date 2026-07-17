Label: wayfinder:task
Status: ready-for-agent

# Correct ADR 0005: the calc module is not a survivor

Map: ../MAP.md

## Problem

[ADR 0005](../../../docs/adr/0005-nextjs-better-auth-neon-stack.md) states, under Consequences:

> Server logic survives: prompt rendering, **the deterministic calc module**, and Garmin `.fit`/`.gpx` parsing port as plain TypeScript modules

No such module exists in `poc/`. Checked while sequencing the rebuild (2026-07-16):

- `poc/public/js/rules.js` (55 lines) is the **Move rules** matrix — `isFrozen`, `classifyMove`. Pure and tested, and it does port, but it is not calculation.
- `poc/public/js/infodata.js` (343 lines) is a **seeded-PRNG synthetic data provider** for the Information View. Its own header calls it "the seam where real data sources plug in later". It fabricates data; it does not compute it.
- Nothing else in `poc/` computes training load, zones, or phase.

The deterministic calculations module is **planned new construction**, not code to carry across. Vetted MIT sources to mine were recorded on 2026-07-09 (athlete-analytics for zones and training-load; formulas cross-checked against Coggan/TrainingPeaks definitions).

The [eval-MVP PRD](../../eval-mvp-build/PRD.md) records this under "Not a port" and excludes it from the port slices. The ADR still says otherwise.

## Why it matters

An ADR is the record of a decision, and this one currently instructs a cold agent to port a module that isn't there. The likely failure is not confusion but invention — an agent that trusts the ADR will find `rules.js` or `infodata.js`, decide one of them must be the calc module, and port it under that name.

## What to do

Amend ADR 0005's Consequences to name the two real survivors (prompt rendering, Garmin parsing) and, if the Move rules are meant to be listed, name them as the Move rules. State plainly that the deterministic calc module is new construction with sources already vetted, not a port.

Follow the amendment style already used in this repo — strike through and date the correction rather than rewriting history silently, as [MAP.md](../MAP.md) and [ADR 0005](../../../docs/adr/0005-nextjs-better-auth-neon-stack.md) itself do for the Option B ruling. The original text records what was believed on 2026-07-16 and should keep saying so.

This is a factual correction with no decision in it, which is why it is `wayfinder:task` and not a grilling — but it edits an ADR, so surface the diff rather than landing it silently.

## Blocked by

None.
