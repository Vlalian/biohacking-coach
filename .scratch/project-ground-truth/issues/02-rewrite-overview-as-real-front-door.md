# Rewrite OVERVIEW.md as the real front door

Label: wayfinder:task
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: 01
Map: ../MAP.md

## Question

OVERVIEW.md still describes this repo as "a Matt Pocock agent skills project" with one example feature — its setup-time identity. Rewrite it so a cold reader (human or agent) learns what this actually is:

- The **Biohacking Coach App** — an Ironman training coach product; point to CONTEXT.md as the domain glossary and docs/adr/ for decisions.
- The **POC** in `poc/` (what it is, how to run it) — defer detail to poc/README.md.
- The **tracker** layout in `.scratch/` and the triage vocabulary.
- The skills setup shrinks to a short section, not the headline.

Constraint: OVERVIEW.md is the first file read — optimize for correct orientation in 30 seconds. Resolution records what the new structure is and anything deliberately dropped.

## Resolution

Done 2026-07-08. New structure of [OVERVIEW.md](../../../OVERVIEW.md):

1. **Headline + two-sentence product description** — Biohacking Coach App, the Coach agent, the weekly ritual, optional Head Coach.
2. **Folder name warning** blockquote — inoculates cold readers against `Trader-proj` regardless of how [Decide the project folder's name](06-decide-the-project-folder-name.md) resolves; remove or reword when that ticket closes.
3. **Orientation table** — where truth lives: CONTEXT.md (glossary), docs/adr/, poc/, .scratch/ tracker, AGENTS.md.
4. **Current state (dated)** — POC scope (Weekly Session loop, calendar, MCQ onboarding, RPE reflections; Session Negotiation retired June 2026), git baseline, domain-expert discovery, this cleanup effort.
5. **Agent skills tooling** — one paragraph; explicitly framed as tooling, not the project.

Deliberately dropped from the old file: the 16-skill inventory table (redundant with `.agents/skills/` and `skills-lock.json`) and the `example-feature` mention (scaffolding slated for deletion in [Sweep the tracker](04-sweep-tracker-statuses-and-scaffolding.md)).

Follow-up encoded in the file itself: the folder-name blockquote cites its ticket, and the "Current state" section is dated so future staleness is self-evident.
