Status: ready-for-agent

# PRD — Eval-MVP Build

## Problem Statement

The [Coach-Evaluation MVP Route](../coach-eval-mvp-route/MAP.md) decided the destination and locked the architecture, stack, data model, and feature scope. Nothing is built. The POC is a vanilla-JS, localStorage-first browser app that cannot serve the eval: a Head Coach logging in from another machine must see the athlete's Tuesday rating, which forces shared server state ([ADR 0006](../../docs/adr/0006-server-authoritative-architecture.md)).

This effort builds the hosted eval-MVP — the thing the recruited human coach evaluates with Mads's real Garmin data.

## Solution

A React/Next.js rebuild on Postgres, per [ADR 0005](../../docs/adr/0005-nextjs-better-auth-neon-stack.md): Next.js + React + better-auth + Neon Frankfurt + Vercel Pro, server-authoritative per ADR 0006.

**The POC is the specification, not the codebase.** Its screens, flows, and behaviour define what to build; its ~40 vitest files encode behaviour worth preserving. Three things port as real code — Garmin `.fit`/`.gpx` parsing, prompt rendering, and the Move rules matrix. Everything else is rebuilt against the spec.

Work lands as thin vertical slices, each demoable on its own and sized for review: `main` is protected and every slice arrives as a pull request reviewed by CodeRabbit.

## Scope

**In scope** — the port work: the walking skeleton, auth, hosting, and every screen and flow the eval needs, each bringing the tables it uses from the [signed-off schema](../coach-eval-mvp-route/issues/05-server-data-model.md).

**Deferred to a second pass** — the two decisions still unresolved on the route map: the **GDPR posture** (lawful basis, consent artifact, Art. 9 health data, deletion path) and the **security hardening consolidation** (CORS, rate limiting, security headers, FIT/GPX metadata sanitisation). Both contain build work; neither is ticketed yet. Their slices join this directory once they lock.

**Deferring those decisions gates real data, not the port.** The slices below may be built and demoed against synthetic or otherwise non-production data while the two decisions are open — that is the whole point of sequencing them now. But **Mads's real Garmin data must not land on hosted infrastructure, and the eval must not be deployed for the recruited coach, until both the GDPR posture and the security hardening are decided and their controls are in place.** Slice 06 is where that line is crossed first (its notes already require both DPAs concluded); slice 11 is where a second real person arrives. Neither ships ahead of the gate.

**Not a port.** [ADR 0005](../../docs/adr/0005-nextjs-better-auth-neon-stack.md) lists "the deterministic calc module" among the survivors, but no such module exists in `poc/` — `rules.js` is the Move rules matrix and `infodata.js` is a seeded synthetic-data provider. The calc module is planned new construction with vetted MIT sources to mine, not code to carry across. ADR 0005 wants correcting on this point.

**Out of scope** — everything the route map ruled out: the full multi-real-athlete product, Electron/desktop and phone packaging, V2 coach surfaces (Roster Briefing, analytics dashboards), and the RAG/Knowledge Oracle.

## User Stories

1. As Mads, I want to log in to a hosted app and see my own Week Plan, so the eval runs on real infrastructure rather than my laptop.
2. As Mads, I want to upload a real Garmin `.fit` file and have the session and its per-sample streams persist server-side, so the coach evaluates real data.
3. As Mads, I want the Coach to run the Weekly Session and remember the conversation across a refresh, so the ritual survives a closed tab.
4. As the recruited Head Coach, I want to log in, see my Roster, and open a linked athlete's Information View, so I can evaluate the real experience.
5. As the recruited Head Coach, I want to prescribe and edit sessions and have my authority respected, so the plan reflects my direction.
6. As a Danish athlete, I want the UI and the Coach in Danish, so the product feels native — as it already does in the POC.

## Implementation Decisions

### Localization is port work, not a new effort

The [Athlete Language](../athlete-language/PRD.md) effort is closed — both its issues are done, and the POC is bilingual today (`translations.js`, 665 lines; `da`/`en`; technical sports terms stay English). The rebuild must carry that forward or silently regress it.

The i18n **mechanism** lands in slice 01, so the first page ever rendered is localized and no component is written English-only. Each later slice ports **its own strings**. This avoids a 665-line translation PR and a retrofit across every component. The Coach's language directive rides with the prompt rendering port (slice 08); the preference itself is set in onboarding (slice 09) and stored per ticket 05.

### Each slice brings its own tables

There is no schema PR. A schema-only change is a horizontal slice that demos nothing and reviews poorly. Each vertical slice adds the tables it needs from the signed-off 11-table schema, and the seed script grows with them.

### The localStorage era ends with the POC

Per ticket 05 ballot 5: no browser migration. The seed script replaces it — Mads's athlete row, the coach, one active Coaching Link, and shallow synthetic athletes. Fresh data through the real flows is better eval evidence anyway.

## Governing Design

[CONTEXT.md](../../CONTEXT.md) is the domain glossary — use its terms exactly. Primary ADRs: [0002 calendar authority](../../docs/adr/0002-calendar-authority-model.md), [0003 Coached Mode authority](../../docs/adr/0003-coached-mode-authority.md), [0004 Information View parity](../../docs/adr/0004-information-view-parity-and-adjustability.md), [0005 stack](../../docs/adr/0005-nextjs-better-auth-neon-stack.md), [0006 server-authoritative](../../docs/adr/0006-server-authoritative-architecture.md). Schema: [route ticket 05](../coach-eval-mvp-route/issues/05-server-data-model.md).
