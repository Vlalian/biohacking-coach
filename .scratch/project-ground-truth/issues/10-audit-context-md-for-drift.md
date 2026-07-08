# Audit CONTEXT.md for drift against the POC and tracker

Label: wayfinder:task
Status: ready-for-agent
Blocked by: (none)
Map: ../MAP.md

## Question

Graduated from the map's last fog patch, now that [Rewrite OVERVIEW.md](02-rewrite-overview-as-real-front-door.md) and [Refresh the POC README](03-refresh-poc-readme-to-weekly-session-era.md) have established ground truth. CONTEXT.md is ~47KB of canonical domain language that evolved fast (Session Negotiation demoted, Weekly Session promoted, Coached Mode added). Audit every glossary entry against the POC code and the tracker:

1. **Stale entries** — terms describing behaviour the POC/product no longer has, or "current" claims that are now historical.
2. **Contradictions** — entries that conflict with each other or with an ADR after later decisions.
3. **Ghost terms** — vocabulary used in code/issues that the glossary never defines (the reverse drift).
4. Classify each finding: fix inline (typo-grade), needs a decision (flag, don't fix), or fine as aspirational spec (CONTEXT.md legitimately describes unbuilt product — V1/V2 entries are not drift).

The README ticket's resolution lists what the POC actually demonstrates — use it as the code-side baseline. Sized for a full fresh session; don't take this one with a tired context. Resolution: a findings table (entry → verdict → action), inline fixes applied, decision-needing items listed for Mads.
