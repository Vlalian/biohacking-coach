---
description: Disciplined diagnosis loop for hard bugs and performance regressions. Reproduce → minimise → hypothesise → instrument → fix → regression-test. Use when user says "diagnose this" / "debug this", reports a bug, says something is broken/throwing/failing, or describes a performance regression.
---

# Diagnose

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, use the project's domain glossary for a clear mental model, and check ADRs in the area you're touching.

## Phase 1 — Build a feedback loop

**This is the skill.** If you have a fast, deterministic, agent-runnable pass/fail signal for the bug, you will find the cause. If you don't, no amount of staring at code will save you.

Spend disproportionate effort here. Be aggressive. Be creative. Refuse to give up.

Ways to construct one (try in order):
1. **Failing test** at whatever seam reaches the bug
2. **Curl / HTTP script** against a running dev server
3. **CLI invocation** with fixture input, diffing stdout against known-good snapshot
4. **Headless browser script** (Playwright / Puppeteer)
5. **Replay a captured trace** — save real network request/payload to disk, replay in isolation
6. **Throwaway harness** — minimal subset of the system with single function call
7. **Property / fuzz loop** — 1000 random inputs looking for failure mode
8. **Bisection harness** — if bug appeared between known states, automate `git bisect run`
9. **Differential loop** — same input through old-version vs new-version
10. **HITL bash script** — last resort; see `.agents/skills/diagnose/scripts/hitl-loop.template.sh`

Iterate on the loop itself: make it faster, make the signal sharper, make it more deterministic.

Do not proceed to Phase 2 without a loop you believe in.

## Phase 2 — Reproduce

Run the loop. Watch the bug appear. Confirm:
- [ ] Failure mode matches what the **user** described (wrong bug = wrong fix)
- [ ] Failure is reproducible across multiple runs
- [ ] Exact symptom captured (error message, wrong output, slow timing)

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them.

Each hypothesis must be **falsifiable**: "If X is the cause, then changing Y will make the bug disappear."

**Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly.

## Phase 4 — Instrument

Each probe maps to a specific prediction from Phase 3. **Change one variable at a time.**

Tool preference:
1. Debugger / REPL inspection
2. Targeted logs at boundaries that distinguish hypotheses
3. Never "log everything and grep"

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup = single grep. Untagged logs survive; tagged logs die.

## Phase 5 — Fix + regression test

Write the regression test **before the fix** — but only if there is a **correct seam** for it.

A correct seam exercises the real bug pattern at the call site. If no correct seam exists, note it and flag the architectural problem.

If a correct seam exists:
1. Turn minimised repro into a failing test
2. Watch it fail
3. Apply the fix
4. Watch it pass
5. Re-run the Phase 1 loop against the original scenario

## Phase 6 — Cleanup + post-mortem

- [ ] Original repro no longer reproduces
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed
- [ ] Throwaway prototypes deleted
- [ ] The correct hypothesis is stated in the commit message

Then ask: what would have prevented this bug? If the answer involves architectural change, hand off to `/improve-codebase-architecture` with specifics.
