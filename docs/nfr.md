# Nonfunctional Requirements

The **functional** requirements — what the app does — live in [CONTEXT.md](../CONTEXT.md) and the
feature PRDs under [.scratch/](../.scratch/). This file holds the **nonfunctional** ones: the
qualities the app must have *while* doing those things — how fast, how secure, how private, how
reliable, how safe. A Coach that answers correctly but takes 40 seconds, or leaks health data, has
met its functional requirement and failed its nonfunctional ones.

The full background — the ISO/IEC 25010 taxonomy these are organised by, the IEEE 29148 rules for
writing them, and the derivation from CONTEXT.md and the ADRs — is in
[.scratch/research/nonfunctional-requirements.md](../.scratch/research/nonfunctional-requirements.md).
This file is the working list.

## How to read this

- Every NFR carries a **fit criterion**: a measurable, testable threshold. "The Coach should be
  fast" is a wish; "≥95% of Coach replies begin streaming within 3 s" is a requirement. If you
  can't write a fit criterion for a requirement, it's ambiguous — sharpen it or drop it.
- **★ = load-bearing** for this app — get it wrong and the product fails or harms someone.
  **○ = real but secondary** at current (solo / small-roster) scale.
- **Targets are PROPOSALS**, not ratified. The numbers (99.5 %, p95 3 s, 30-day erasure) are
  first drafts to decide on — see [Open decisions](#open-decisions).
- Each NFR is traced to its **source** (a functional requirement, an ADR, or a research note) so
  you can see why it exists.

---

## Security ★

Health-adjacent data flowing through a hosted LLM makes this the top priority.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **SEC-1** | All athlete data encrypted in transit and at rest. | TLS 1.2+ on the wire; provider encryption at rest (Neon/Vercel); no plaintext data at rest — verified by config audit. | ADR 0006 |
| **SEC-2** | Login identity is separated from training data. | Training tables carry no name/email column and are keyed only by an opaque athlete ID; a leak of training data alone identifies no one — verified by schema review. | ADR 0006 |
| **SEC-3** | No endpoint returns data for an athlete the caller isn't authorized for. | An authorization test suite covering athlete↔athlete and Head-Coach↔athlete boundaries (gated by Link Visibility) passes 100 %. | CONTEXT.md (Link Visibility), ADR 0006 |
| **SEC-4** | No direct identifier is ever sent to the Anthropic API. | Prompt-builder unit tests assert absence of name/email/DOB/location in every prompt. | GDPR decision 1 (enforced in POC; must carry into the rebuild) |
| **SEC-5** | API key and DB credentials are server-only secrets. | No secret appears in the client bundle — verified by build inspection. | ADR 0006 (UI-API-key pattern retired) |

## Privacy / Compliance ★

GDPR is binding here: EU athletes, health-adjacent data.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **PRIV-1** | Athlete data at rest resides in the EU. *(Constraint, not just NFR.)* | Neon project in Frankfurt (`aws-eu-central-1`); app functions in an EU region. | postgres-host research, ADR 0005 |
| **PRIV-2** | A Data Processing Agreement is in force with every processor before real athlete data lands. | DPAs concluded and recorded for DB host, app host, and Anthropic. | postgres-host research |
| **PRIV-3** | An athlete can export and fully erase their data. | Erasure removes all of an athlete's rows within **30 days (proposed)** — verified by an erasure integration test. | ADR 0006, gdpr-decisions.md B |
| **PRIV-4** | Health-adjacent processing has an explicit lawful basis, captured at onboarding. | A consent flow (likely Art. 9 explicit consent) is present and logged before any data is processed, disclosing server storage and Anthropic as processor. | gdpr-decisions.md A, ADR 0006 — *open legal question* |
| **PRIV-5** | Only data necessary for coaching is collected and transmitted. | Field-level justification documented; the LLM receives only Session Context, never the raw store. | CONTEXT.md (Session Context), gdpr-decisions.md 5 |

## Safety ★

An AI Coach giving training and recovery advice has a genuine harm surface — distinct from
security (security is about attackers; safety is about harm to the user from the system's own
behavior).

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **SAFE-1** | The Coach never gives medical diagnoses or injury-treatment prescriptions. | A red-team eval suite of health-risk prompts passes; the Coach stays within training coaching and defers health concerns to professionals. | CONTEXT.md (Coach scope), gdpr-decisions.md 3 |
| **SAFE-2** | On input signalling acute risk (chest pain, injury, illness), the Coach advises seeking care and does not push training load. | Eval scenarios for acute signals verified. | Derived from Contextual Signals / Check-in |
| **SAFE-3** | Training-science claims are grounded, not hallucinated. | Claims come from the Knowledge Oracle (RAG, with citations) or the deterministic calc module (via tool-use), not free generation. | CONTEXT.md (Knowledge Oracle); also a runtime-guardrail concern |

## Reliability ★

ADR 0006 made the server the single source of truth, so its availability *is* the app's
availability.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **REL-1** | The Coach API is highly available. | Monthly availability **≥ 99.5 % (proposed)** — ≈3.6 h/month error budget — measured by uptime monitoring. | ADR 0006 |
| **REL-2** | No committed athlete write is lost. | RPO = 0 for confirmed writes; on interruption the app shows an explicit offline state rather than failing silently. | ADR 0006 ("the app says so and waits") |
| **REL-3** | LLM failures degrade gracefully. | On Anthropic API error/timeout, no partial or corrupt Week Plan persists — verified by a fault-injection test. | Derived (Coach is an external dependency) |

## Performance Efficiency ★

An interactive LLM: latency is felt directly.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **PERF-1** | The Coach responds promptly. | **≥95 % of Coach Chat responses begin streaming within 3 s (proposed)** — server-side metric, rolling 7 days. | Derived from US-2, Week 1 "BOOM" |
| **PERF-2** | Core screens are responsive. | Training Plan calendar and Session Drawer interactive within **2 s (proposed)** on a mid-range device / typical connection; Core Web Vitals (LCP/INP) within Google "good" thresholds. | eslint core-web-vitals, CONTEXT.md |
| **PERF-3** | LLM cost per athlete stays within budget. | Per-athlete monthly LLM cost tracked; alert on breach of a **set budget (TBD)**. | LLM-specific — not in repo yet |

## Interaction Capability / Accessibility ○→★

Onboarding friction is a named drop-off risk, which lifts UX-1 toward load-bearing.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **UX-1** | First-session onboarding is fast. | Median time-to-first-Coach-message and onboarding completion rate tracked against a **target (TBD)**. | CONTEXT.md Origin Story (onboarding friction = primary drop-off risk) |
| **UX-2** | The app meets WCAG 2.2 Level AA. | Automated axe scan + manual audit show no Level A/AA violations on core flows. | ISO 25010 inclusivity; possibly an EU Accessibility Act *constraint* — see open decisions |

## Maintainability ○

Matters for the AI-legibility goal behind the stack choice.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **MAINT-1** | Product code passes the gates before merge. | `eslint`, `tsc --noEmit`, and `vitest` clean — CI-enforced. *(CI not yet wired.)* | package.json, AGENTS.md Definition of Done |
| **MAINT-2** | Business logic stays a pure, tested core. | No DB/HTTP imports in the calc module or prompt rendering; unit-tested. | codebase-structure-guidelines.md, ADR 0005/0006 |

## Observability ○

Operationally necessary — you can't *verify* the ★ NFRs above without it.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **OBS-1** | Coach latency, error rate, token cost, and flagged unsafe outputs are logged and dashboarded. | Metrics exist for PERF-1, PERF-3, REL-1, SAFE-1. *(Not in repo yet.)* | Derived — required to verify the ★ NFRs |

## Compatibility / Flexibility ○

Secondary at MVP scale.

| ID | Requirement | Fit criterion | Source |
|---|---|---|---|
| **COMPAT-1** | Garmin `.fit`/`.gpx` import parses what athletes actually export. | A fixture corpus of real exports parses without error. | CONTEXT.md Historical Data Upload |
| **FLEX-1** | UI and Coach support English + Danish; technical sport terms stay in English. | Both locales complete (`next-intl` already a dependency). | CONTEXT.md (Athlete Language), package.json |
| **FLEX-2** | Architecture scales from solo athletes to a Head Coach's roster without redesign. | Load test at target roster size passes. | ADR 0006 (server authority = "rows in a table") |

---

## The load-bearing cut

Get these right or the product fails or harms someone — they flow from three facts about *this*
app: it handles **special-category health data**, it processes that data through a **hosted LLM**,
and (post-ADR-0006) the **server owns the only copy**.

- **Security** (SEC-1..5)
- **Privacy / GDPR** (PRIV-1..5)
- **Safety of generated advice** (SAFE-1..3)
- **Coach reliability + no data loss** (REL-1..3)
- **Coach latency** (PERF-1)

Everything else is real but won't sink the MVP the way a GDPR failure or an unsafe Coach reply
would.

## Trade-offs to name when setting targets

NFRs conflict; improving one often costs another. The ones already visible here:

- **Security ↔ functionality:** end-to-end encryption would improve confidentiality but was
  *ruled out* in ADR 0006 — the Coach, the calc module, and the Head Coach all must read the data.
- **Performance/cost ↔ Coach quality:** a bigger context window or model gives better advice at
  higher latency and cost.
- **Privacy (data minimization) ↔ Coaching Presence:** the more context the Coach holds, the
  better it coaches — and that context is the product's core value. PRIV-5 sits in tension with
  the whole premise; the fit criterion is where you draw the line.

## Open decisions

1. **Targets.** Ratify the proposed numbers (99.5 % uptime, p95 3 s, 30-day erasure, the cost
   budget) or replace them with values you'll actually commit to and test against.
2. **Is self-reported training data "health data" under GDPR Art. 9?** The single most
   consequential open legal question — it sets the required bar for PRIV-4 and the SEC-* group.
   Flagged in [gdpr-decisions.md](../.scratch/mvp/gdpr-decisions.md) open questions 1 & 4.
3. **Is WCAG AA a legal constraint (EU Accessibility Act) or a quality goal?** Decides whether
   UX-2 is ★ or ○.
4. **LLM cost budget + observability.** Neither exists in the repo yet; setting a per-athlete
   budget gives PERF-3 and OBS-1 a target.
5. **Should any of these become ADRs?** The architecturally-significant ones (identity separation,
   server availability, the no-E2E-encryption trade-off) are arguably decisions, not just
   requirements — some may deserve their own ADR rather than a table row.
