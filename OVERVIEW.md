# Project Overview

This is a **Matt Pocock agent skills** project — a collection of Claude agent skills configured for use in a repo. It's set up with a local-markdown issue tracker (issues live under `.scratch/`).

---

## Skills (16 total, from `mattpocock/skills` on GitHub)

### Engineering Skills

| Skill | Purpose |
|---|---|
| **diagnose** | Disciplined bug diagnosis: reproduce → minimise → hypothesise → instrument → fix → regression-test |
| **grill-with-docs** | Stress-test a plan against the domain model; updates `CONTEXT.md` and ADRs inline |
| **improve-codebase-architecture** | Surface architectural friction, find "deepening" opportunities (deep modules), produce an HTML report |
| **tdd** | Test-driven development with red-green-refactor vertical slices |
| **to-issues** | Break a plan/PRD into independently-grabbable GitHub/local issues |
| **to-prd** | Synthesize conversation context into a PRD, publish to issue tracker |
| **triage** | Move issues through a state machine (`needs-triage` → `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`) |
| **zoom-out** | Ask for a higher-level map of modules/callers for unfamiliar code |
| **setup-matt-pocock-skills** | One-time setup: configures issue tracker, triage labels, and domain doc layout in `AGENTS.md` |

### Productivity Skills

| Skill | Purpose |
|---|---|
| **caveman** | Ultra-compressed ~75% fewer tokens communication mode |
| **grill-me** | Relentless interview on a plan/design until shared understanding |
| **handoff** | Compact current conversation into a handoff doc for a fresh agent |
| **teach** | Stateful multi-session teaching workspace with lessons, references, learning records |
| **write-a-skill** | Create new skills with proper structure |
| **prototype** | Build throwaway prototypes — either a terminal app (logic/state) or multiple UI variations |

### Product & UX Skills

| Skill | Purpose |
|---|---|
| **user-stories-and-journeys** | Guide creation of user stories and journey maps using Donna Lichaw's narrative-arc storymapping (Concept / Origin / Usage stories), Jeff Patton's agile user story mapping, and UX journey mapping best practices |

---

## Repo Configuration

- **Issue tracker**: Local markdown under `.scratch/<feature>/`
- **Triage labels**: Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`)
- **Domain docs**: Single-context layout — `CONTEXT.md` at root + `docs/adr/`
- **Example feature**: `.scratch/example-feature/` with a PRD and one `needs-triage` issue
