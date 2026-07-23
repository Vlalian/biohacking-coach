# Biohacking Coach App

An AI coaching product for Ironman trainees. The **Coach** — an LLM agent holding full athlete context — runs a weekly training ritual: it reads the athlete's Check-in and Session Reflections, builds the Week Plan, and negotiates it as a peer backed by training science. An optional human **Head Coach** can oversee linked athletes (Coached Mode, V1).

## Orientation — where truth lives

| Surface | What it holds |
|---|---|
| [CONTEXT.md](CONTEXT.md) | The domain glossary. Canonical terms (Weekly Session, Week Plan, Session Reflection, Coached Mode, ...) — use them exactly, don't drift to synonyms. |
| [docs/adr/](docs/adr/) | Architecture decision records: Coach-voice-only guided tour, calendar authority model, Coached Mode authority. |
| [docs/nfr.md](docs/nfr.md) | Nonfunctional requirements: the quality bars (security, privacy/GDPR, safety, reliability, latency) each with a measurable fit criterion. |
| [poc/](poc/) | The working browser POC of the Coach interaction loop. Run instructions in [poc/README.md](poc/README.md). |
| [.scratch/](.scratch/) | The local-markdown issue tracker — one directory per feature holding a `PRD.md` and `issues/`. Conventions: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md), labels: [docs/agents/triage-labels.md](docs/agents/triage-labels.md). |
| [AGENTS.md](AGENTS.md) | Pointer file agents read first: tracker, labels, domain-doc layout. |

## Current state (2026-07-16)

- The POC implements the **Weekly Session** loop (Check-in → Review → Planning), the monthly **Training Plan** calendar, **MCQ onboarding**, and RPE-based **Session Reflections**. Daily Session Negotiation was retired as the primary loop in June 2026 — the Weekly Session replaced it.
- Git history starts at the 2026-07-08 baseline commit. The repo lives at [Vlalian/biohacking-coach](https://github.com/Vlalian/biohacking-coach) (private, since 2026-07-16). `main` is protected: work lands through pull requests, reviewed by CodeRabbit. Agent sessions may push branches; opening and merging the PR is Mads's call.
- Product discovery with a domain expert is ongoing — open questions in [.scratch/mvp/domain-expert-questions.md](.scratch/mvp/domain-expert-questions.md).
- A cleanup effort, [Project Ground Truth](.scratch/project-ground-truth/MAP.md), is bringing the repo's orientation surfaces in line with reality.

## Deployment

The eval MVP is hosted on **Vercel Pro**, functions pinned to the **Frankfurt (`fra1`)** region for EU data residency alongside the Neon Frankfurt database (`vercel.json`).

- **Production URL:** https://biohacking-coach-vlalians-projects.vercel.app
- **Secrets** live only in Vercel environment variables (Production + Preview), never in the repo or client code: `DATABASE_URL` (Neon), `BETTER_AUTH_SECRET`, and `ANTHROPIC_API_KEY` (used from slice 08). `BETTER_AUTH_URL` is **not** a required secret — the auth base URL is derived at runtime from Vercel's `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, so production and branch previews each sign against their own origin.
- Pushing to `main` deploys to production; a pull request gets its own preview deployment.

## Agent skills tooling

The repo carries a Matt Pocock skills installation (`.agents/skills/`, `.claude/commands/`, pinned by `skills-lock.json`), configured with the local-markdown tracker, default triage vocabulary, and single-context domain docs. This is tooling that supports the project — it is not the project.
