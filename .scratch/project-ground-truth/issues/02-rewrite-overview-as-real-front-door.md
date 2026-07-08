# Rewrite OVERVIEW.md as the real front door

Label: wayfinder:task
Status: ready-for-agent
Blocked by: 01
Map: ../MAP.md

## Question

OVERVIEW.md still describes this repo as "a Matt Pocock agent skills project" with one example feature — its setup-time identity. Rewrite it so a cold reader (human or agent) learns what this actually is:

- The **Biohacking Coach App** — an Ironman training coach product; point to CONTEXT.md as the domain glossary and docs/adr/ for decisions.
- The **POC** in `poc/` (what it is, how to run it) — defer detail to poc/README.md.
- The **tracker** layout in `.scratch/` and the triage vocabulary.
- The skills setup shrinks to a short section, not the headline.

Constraint: OVERVIEW.md is the first file read — optimize for correct orientation in 30 seconds. Resolution records what the new structure is and anything deliberately dropped.
