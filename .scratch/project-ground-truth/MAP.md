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
- [Refresh the POC README to the Weekly Session era](issues/03-refresh-poc-readme-to-weekly-session-era.md) — README rewritten from source (Weekly Session arcs, calendar, onboarding, patterns, personas verified); server log + package.json Session-Negotiation-era claims also fixed; pre-existing 4-test jsdom failure ticketed separately.
- [Sweep the tracker: statuses, missing PRD, example-feature](issues/04-sweep-tracker-statuses-and-scaffolding.md) — 9 finished features now say done (incl. two stale-open nav issues flipped after code verification), nav-training-plan got its PRD stub, example-feature deleted, settings.local.json untracked; every done claim shallow-verified, none false.
- [Retire the hand-rolled deletion log](issues/05-retire-hand-rolled-deletion-log.md) — deleted; content recoverable via `git show 4ae934a:.scratch/deleted-session-negotiation.md`.
- [Decide the project folder's name](issues/06-decide-the-project-folder-name.md) — rename decided but deferred (needs its own Claude-memory-migration session); OVERVIEW warning updated to state the intent.
- [Identify fallow and rule on its artifacts](issues/07-identify-fallow-and-rule-on-artifacts.md) — fallow is a Rust TS/JS dead-code analyzer, trialled once on 2026-06-25 to find the Session Negotiation dead code; config kept, stale caches deleted ([research asset](assets/fallow-research.md)).
- [Decide git workflow protections](issues/09-decide-git-workflow-protections.md) — guardrails hooks installed for Bash and PowerShell (with a no-jq fallback fix); commit convention and backup bundle consciously declined.
- [Make npm test pass out of the box](issues/08-make-npm-test-pass-out-of-the-box.md) — root cause was module-level state leaking between tests (plus jsdom's missing scrollIntoView); test-side fix, 31/31 green.
- [Audit CONTEXT.md for drift](issues/10-audit-context-md-for-drift.md) — glossary largely healthy; 9 stale/contradictory entries fixed inline (incl. a pre-git corruption that had eaten the View entry), 4 ghost terms defined (Fixed Constraint, Unavailable, Weekly Session Day, Session Feedback), GDPR doc's emoji→RPE terminology aligned; two flags graduated into [Rule on the drift audit's flagged glossary decisions](issues/11-rule-on-drift-audit-flags.md).

## Not yet specified

(none — the fog is cleared; all remaining work is ticketed)

## Out of scope

- **Executing a folder rename** — only the *decision* on the `Trader-proj` name is in scope; physically renaming breaks Claude project memory/session keying and would be its own effort if chosen.
- **Domain expert round 2** (Draggable Calendar + Coached Mode questions, pending since 2026-07-05) — product discovery, not ground-truth cleanup.
- **Feature work** in `.scratch/` (draggable-calendar, multi-session-day, ...) — the sweep fixes their *statuses*, not their content.
- **GitHub remote / publishing** — git stays local per the standing decision.
