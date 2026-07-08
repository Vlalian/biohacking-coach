# Project Ground Truth

Label: wayfinder:map
Status: open
Created: 2026-07-08

## Destination

Every orientation surface of this repo tells the truth — OVERVIEW.md, poc/README.md, tracker statuses, and leftover scaffolding all match project reality — and each structural question (version control, folder name, fallow artifacts) has a recorded decision. Big moves get decided here, not necessarily executed (git init is the one approved execution).

## Notes

- **Execution override**: this map carries execution. Ticket sessions apply the doc/status fixes directly rather than only recording what should change. (Approved by Mads, 2026-07-08.)
- **Standing decision**: git init is approved (Mads, 2026-07-08) — local repo only, no GitHub remote. The ticket executes it.
- Domain language lives in [CONTEXT.md](../../CONTEXT.md); use its terms exactly (Weekly Session, Session Reflection, Coached Mode, ...).
- Wayfinding operations on this local-markdown tracker:
  - The map is this file. Tickets are `issues/NN-<slug>.md` in this directory.
  - Ticket labels: `Label: wayfinder:<research|prototype|grilling|task>` line near the top.
  - **Claim** = set an `Assignee:` line on the ticket before any work. Open + unassigned = unclaimed.
  - **Blocking** = a `Blocked by: NN, NN` line in the ticket body. Unblocked when every listed ticket has `Status: done`.
  - **Frontier** = tickets with `Status: ready-for-agent` or `ready-for-human`, no assignee, and no open blockers.
  - **Resolve** = append the answer under `## Resolution`, set `Status: done`, add one line to Decisions so far below.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Initialize git and commit the baseline](issues/01-initialize-git-and-commit-baseline.md) — repo initialized, baseline commit `4ae934a` (158 files), root .gitignore excludes node_modules/.fallow, repo-local identity set for Mads; `.claude/settings.local.json` tracked — flagged for the sweep.
- [Rewrite OVERVIEW.md as the real front door](issues/02-rewrite-overview-as-real-front-door.md) — OVERVIEW.md now describes the Biohacking Coach App (product, orientation table, dated current-state, skills demoted to tooling), with a folder-name warning that cites its open ticket.

## Not yet specified

- **CONTEXT.md ↔ POC drift audit** — CONTEXT.md is 47KB of domain language and the POC has evolved fast (Session Negotiation removed, Weekly Session primary). Whether the glossary itself has stale or contradictory entries can't be phrased as a sharp question until the OVERVIEW/README work surfaces concrete drift. Revisit after those tickets close.
- **What replaces the deletion-log habit** — if git changes the workflow (guardrails hooks? commit conventions?), that practice question becomes ticketable once git exists and has been used for a few changes.

## Out of scope

- **Executing a folder rename** — only the *decision* on the `Trader-proj` name is in scope; physically renaming breaks Claude project memory/session keying and would be its own effort if chosen.
- **Domain expert round 2** (Draggable Calendar + Coached Mode questions, pending since 2026-07-05) — product discovery, not ground-truth cleanup.
- **Feature work** in `.scratch/` (draggable-calendar, multi-session-day, ...) — the sweep fixes their *statuses*, not their content.
- **GitHub remote / publishing** — git stays local per the standing decision.
