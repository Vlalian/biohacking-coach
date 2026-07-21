# Nonfunctional Requirements (NFRs) — What They Are and a Starter Set for This App

Research notes, 2026-07-20. Grounded in primary sources (the ISO/IEEE standards themselves, the SEI's own papers, the W3C recommendation, the Volere template); every substantive claim cites where it comes from, fetched live on this date. Written for a learning developer: jargon is explained the first time it appears. The final section proposes a first-draft NFR list for this specific project, grounded in `CONTEXT.md`, the ADRs, and the EU-residency/GDPR research already in this folder.

---

## The Playbook (do this in practice)

You have extensive **functional** requirements (what the app does — the Weekly Session, the Training Plan, Session Reflections, all of `CONTEXT.md`) and no **nonfunctional** ones (how *well* it must do them — how fast, how safe, how private, how reliable). Here is the whole method, condensed:

1. **Know the three buckets.** *Functional* = what the system does. *Nonfunctional (quality)* = qualities it must have while doing it (performance, security, reliability…). *Constraint* = a non-negotiable given (must be EU data residency; must use Next.js). This document is about the middle bucket, but constraints are called out where they bind. ISO/IEC 25010 is the standard catalog of the quality bucket ([ISO/IEC 25010:2023](https://www.iso.org/obp/ui/en/#!iso:std:78176:en)).
2. **Use ISO/IEC 25010 as the checklist so you don't miss a category.** Its nine characteristics (functional suitability, performance efficiency, compatibility, interaction capability, reliability, security, safety, maintainability, flexibility) are exactly a menu of NFR types — walk each one and ask "does this app need a requirement here?" ([iso25000.com](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010)).
3. **Write every NFR with a measurable fit criterion.** A good NFR is testable: not "the Coach should be fast" but "95% of Coach replies begin streaming within 3 s". The rule comes from Volere: "A fit criterion is a measurement of the requirement such that it is possible to non-subjectively test whether the solution fits" and "If a fit criterion cannot be found for a requirement, then the requirement is either ambiguous or poorly understood" ([Volere template](https://www.volere.org/templates/volere-requirements-specification-template/)).
4. **Check each NFR against IEEE 29148's nine qualities** — necessary, appropriate, unambiguous, complete, singular, feasible, verifiable, correct, conforming ([ISO/IEC/IEEE 29148:2018](https://www.iso.org/standard/72089.html)). "Verifiable" and "singular" catch most bad NFRs.
5. **Prioritize by what's load-bearing here, not by category count.** For a health/biohacking coaching app processing EU athletes' health-adjacent data through a hosted LLM, the genuinely load-bearing NFRs are **privacy/security/data-residency, reliability of the Coach, and LLM-specific concerns (latency, cost, safety of generated advice)**. Everything else is real but secondary. The starter set in the last section is ordered that way.
6. **Derive, don't invent.** Most NFRs fall out of functional requirements + the domain: "the Coach answers with full context from the first word" (US-2) *implies* a latency NFR; "special category health data" (GDPR research) *implies* security/privacy NFRs; "Coached Mode = server-authoritative shared state" (ADR 0006) *implies* availability and consistency NFRs. Section 5 shows the derivation.
7. **Record them where decisions live.** This repo keeps durable decisions in `docs/adr/` and domain truth in `CONTEXT.md`. NFRs belong alongside — either a new `docs/nfr.md`, a section, or (for ones that are really architectural decisions) an ADR. Don't let them float in chat.

The rest is the sourced detail and the derivation.

---

## 1. Definitions: functional vs nonfunctional vs constraint

- A **functional requirement** states *what the system must do* — a behavior, a feature, an input→output. "The athlete can mark a session complete" is functional. Almost all of `CONTEXT.md` is functional.
- A **nonfunctional requirement (NFR)**, also called a **quality requirement** or **quality attribute**, states *a property the system must have while doing those things* — how fast, how secure, how available, how usable, how maintainable. The SEI frames these as the "-ilities": "modifiability, security, performance, availability, and so forth" ([SEI, *The Architecture Tradeoff Analysis Method*](https://www.sei.cmu.edu/documents/1186/1998_005_001_16646.pdf)). NFRs are what this document is about.
- A **constraint** is a fixed given the design cannot trade away — a technology mandate, a legal boundary, a budget. "Data at rest must stay in the EU" and "the stack is Next.js + better-auth + Neon" (ADR 0005) are constraints. Constraints and NFRs interact: the EU-residency constraint *drives* several security/privacy NFRs.

Why the distinction earns its keep: functional requirements tell you *whether* to build a feature; NFRs tell you *whether the built feature is acceptable*. A Coach that answers correctly but takes 40 seconds, or leaks health data, has met its functional requirement and failed its nonfunctional ones. NFRs are also disproportionately **architectural** — they're the reason the SEI evaluates *architectures* against them (Section 4), because you usually can't bolt on performance or security late.

Two authoritative anchors used throughout:
- **ISO/IEC 25010** — the *product quality model*: a standard taxonomy of the quality characteristics software can have. Its stated purpose is to "provide consistent terminology for specifying, measuring and evaluating system and software product quality" and "a set of quality characteristics against which stated quality requirements can be compared for completeness" ([ISO/IEC 25010:2023, official text](https://www.iso.org/obp/ui/en/#!iso:std:78176:en)). Use it as the *catalog of NFR types*.
- **ISO/IEC/IEEE 29148** — the *requirements engineering* standard: how to write and verify requirements well. It "provides details for the construct of well-formed textual requirements, to include characteristics and attributes" ([ISO/IEC/IEEE 29148:2018, catalog](https://www.iso.org/standard/72089.html)). Use it as the *rulebook for writing each NFR*.

---

## 2. The standard taxonomy — ISO/IEC 25010:2023, each category in plain language

ISO/IEC 25010 was revised in 2023. The revision renamed **Usability → Interaction Capability** and **Portability → Flexibility**, and **added Safety** as a ninth top-level characteristic, plus new sub-characteristics (inclusivity and self-descriptiveness under interaction capability, resistance under security, scalability under flexibility) ([arc42 quality model, 2023 update](https://quality.arc42.org/articles/iso-25010-update-2023); [iso25000.com](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010)). The nine characteristics ([ISO/IEC 25010:2023](https://www.iso.org/obp/ui/en/#!iso:std:78176:en)):

Definitions marked "quoted" are verbatim from the official iso25000.com summary (the standard's authors' portal); sub-characteristic lists for the four characteristics that page paginates behind are cross-checked against the arc42 2023 summary and noted as such — the definitive wording lives in the paid standard.

1. **Functional Suitability** — "the degree to which a product or system provides functions that meet stated and implied needs when used under specified conditions" (quoted, [iso25000.com](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010)). Sub: functional completeness, functional correctness, functional appropriateness. *(This is the bridge from your functional requirements — "correctness" is an NFR about them: does the Coach's plan actually reflect the data?)*

2. **Performance Efficiency** — "the degree to which a product performs its functions within specified time and throughput parameters and is efficient in the use of resources" (quoted). Sub: time behaviour, resource utilization, capacity. *Measured by:* latency (time to first token / full response), throughput (requests/sec), resource cost. **Load-bearing here** — the Coach is an interactive LLM.

3. **Compatibility** — "degree to which a product... can exchange information with other products... and/or perform its required functions while sharing the same common environment" (quoted). Sub: co-existence, interoperability. *Measured by:* does it integrate with Garmin (`.fit`/`.gpx`, later the API), run across browsers/devices. Secondary now.

4. **Interaction Capability** (formerly Usability) — "degree to which a product... can be interacted with by specified users to exchange information via the user interface to complete specific tasks" (quoted). Sub: appropriateness recognizability, learnability, operability, **user error protection**, user engagement, **inclusivity**, user assistance, **self-descriptiveness**. *Measured by:* task completion time/rate, onboarding drop-off, and — for inclusivity — **accessibility conformance (WCAG, Section 5)**. Relevant: onboarding friction is a named drop-off risk in CONTEXT.md's Origin Story.

5. **Reliability** — "degree to which a system... performs specified functions under specified conditions for a specified period of time" (quoted, [iso25000.com](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010)). Sub: **faultlessness** ("performs specified functions without fault under normal operation"), **availability** ("operational and accessible when required for use"), fault tolerance, **recoverability** ("in the event of an interruption or a failure, a product or system can recover the data directly affected and re-establish the desired state") (quoted). *Measured by:* uptime %, error rate, an **error budget** (the allowed amount of failure), recovery time/point objectives (how fast you recover, how much data you can lose). **Load-bearing here** — ADR 0006 made the server the single source of truth, so its availability *is* the app's availability.

6. **Security** — protection of data and functions. Sub: confidentiality, integrity, non-repudiation, accountability, authenticity, and **resistance** (added 2023 — resilience against attack) ([iso25000.com](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010); resistance-added confirmed by [arc42](https://quality.arc42.org/articles/iso-25010-update-2023)). *Measured by:* authn/authz correctness, encryption in transit/at rest, absence of known vulns, PII exposure. **Most load-bearing here** — health-adjacent data + a hosted LLM.

7. **Safety** (new in 2023) — freedom from unacceptable risk of harm to people/environment/property. Sub: operational constraint, risk identification, fail safe, hazard warning, safe integration ([confirmed via arc42 / iso25000](https://quality.arc42.org/articles/iso-25010-update-2023)). *Measured by:* presence of hazard controls. **Unusually relevant here** — an AI Coach giving training/recovery advice to athletes has a genuine safety surface (overtraining, injury, ignoring a "my chest hurts" signal). Distinct from security: security is about attackers, safety is about harm to the user from the system's own behavior.

8. **Maintainability** — how easily the software can be modified. Sub: modularity, reusability, analysability, modifiability, testability ([iso25000.com](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010)). *Measured by:* test coverage, module coupling, time-to-change, linter/type cleanliness. Relevant given the AI-legibility goal in ADR 0005 and the pure-core rule in `codebase-structure-guidelines.md`.

9. **Flexibility** (formerly Portability) — adaptability to different contexts. Sub: adaptability, **scalability** (added 2023), installability, replaceability ([arc42 2023 update](https://quality.arc42.org/articles/iso-25010-update-2023)). *Measured by:* can it scale to N athletes, move hosts, add a language. Secondary at MVP scale (solo/small roster) but scalability matters if it grows.

**Beyond 25010:** two quality areas the product-quality model under-emphasizes and this app needs explicitly:
- **Privacy/compliance** — 25010 folds privacy under confidentiality, but GDPR obligations (lawful basis, data-subject rights, data residency) are first-class here and deserve their own NFRs. (25010's sibling standard 25012 covers *data* quality; GDPR is the binding source.)
- **Observability** — the ability to see what the system is doing in production (logs, metrics, traces). Not a 25010 characteristic but a modern operational NFR, and one an LLM app needs (to see cost, latency, and bad Coach outputs).

---

## 3. How to write a GOOD NFR: specific, measurable, verifiable

An NFR that can't be tested is a wish. Two authorities give the rules.

### IEEE/ISO/IEC 29148 — the nine characteristics of a well-formed requirement

29148:2018 "prescribes nine essential characteristics for well-formed requirements: **necessary, appropriate, unambiguous, complete, singular, feasible, verifiable, correct, and conforming**" ([ISO/IEC/IEEE 29148:2018, catalog](https://www.iso.org/standard/72089.html)). The two that most often catch a bad NFR:
- **Verifiable** — you can confirm by test/inspection/analysis that it's met. "Fast" is not verifiable; "p95 < 3 s" is.
- **Singular** — one requirement, one statement. "Secure and fast and accessible" is three requirements pretending to be one.

29148 also frames verification itself: "Requirements verification is the confirmation by examination that requirements are well-formed" (ibid.). Kiro's **EARS** notation (Section on spec tools in the guardrails doc) is one popular template for hitting "unambiguous" and "singular": *"When <trigger>, the <system> shall <response>."*

### Volere — the fit criterion (the practical heart of it)

The most usable single idea comes from the **Volere** template (Suzanne & James Robertson). Every requirement gets a **fit criterion**: "A fit criterion is a measurement of the requirement such that it is possible to non-subjectively test whether the solution fits the original requirement" ([Volere template](https://www.volere.org/templates/volere-requirements-specification-template/)). Volere is emphatic that this applies to NFRs specifically — "Nonfunctional requirements... are the properties that the functions must have, such as performance and usability" — and that "All requirements can be measured, and all should carry a fit criterion" and "If a fit criterion cannot be found for a requirement, then the requirement is either ambiguous or poorly understood" (ibid.).

### The template

> **Requirement:** <the quality the system must have>
> **Fit criterion:** <the measurable, testable threshold that proves it>
> **Scale/measure:** <the unit> — **Target:** <value> — **Verified by:** <test/tool/method>

### Good vs bad (using this app)

| Bad (unverifiable) | Good (has a fit criterion) |
|---|---|
| "The Coach should respond quickly." | "For Coach Chat, ≥95% of responses begin streaming within 3 s and complete within 15 s, measured server-side over a rolling 7-day window." |
| "The app must be secure." | "All athlete data is encrypted in transit (TLS 1.2+) and at rest; login identity and training data are stored in separate tables keyed only by an opaque athlete ID (per ADR 0006); no endpoint returns another athlete's data — verified by an authorization test suite." |
| "The app should be reliable." | "Monthly availability of the Coach API ≥ 99.5% (error budget ~3.6 h/month); on failure the app shows an explicit offline state and loses no committed data (RPO = 0 for confirmed writes)." |
| "The Coach must be safe." | "The Coach never gives medical diagnoses or injury-treatment instructions; on any athlete input signalling acute health risk (e.g. chest pain), it advises seeking professional care and does not prescribe training — verified by a red-team eval suite of N such prompts." |
| "It must be private/GDPR-compliant." | "No direct identifier (name, email, DOB, location) is ever sent to the Anthropic API (GDPR decision 1); a data-subject erasure request removes all of an athlete's rows within 30 days — verified by an erasure integration test." |

Note how each "good" version names a **scale, a target, and a verification method** — that's the whole discipline.

---

## 4. How to elicit and derive NFRs

NFRs rarely arrive pre-written; you extract them. Methods, from primary sources:

- **Walk the ISO 25010 checklist.** For each of the nine characteristics (Section 2), ask "does this app need a requirement here, and what's the fit criterion?" The standard is explicitly meant for this — it provides characteristics "against which stated quality requirements can be compared for completeness" ([ISO/IEC 25010:2023](https://www.iso.org/obp/ui/en/#!iso:std:78176:en)). This alone surfaces 80% of them.

- **Derive from functional requirements + domain.** Most NFRs are latent in features you've already specified. Each functional requirement implies quality thresholds: an interactive Coach implies latency; shared server state implies availability + consistency; health data implies security + privacy. Section 5 does this derivation explicitly against `CONTEXT.md` and the ADRs.

- **Quality Attribute Workshop / utility tree (SEI).** The SEI's method for eliciting and prioritizing NFRs is to gather stakeholders and build **quality-attribute scenarios** — "short, 'use-case'-like descriptions that pose a functional situation on the system and demonstrate how a quality attribute is manifested" — organized into a **utility tree** that translates vague goals into "'testable' quality attribute scenarios" ([SEI ATAM materials](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/); [SEI ATAM paper](https://www.sei.cmu.edu/documents/1186/1998_005_001_16646.pdf)). A scenario has a stimulus, an environment, and a measurable response — which is just the fit-criterion idea applied to architecture.

- **ATAM — evaluate the architecture against the NFRs, and find the trade-offs.** The Architecture Tradeoff Analysis Method "assess[es] the consequences of architectural decision alternatives in light of quality attribute requirements... to discover risks, non-risks, sensitivity points, and tradeoffs — decisions affecting more than one quality attribute" ([SEI ATAM paper](https://www.sei.cmu.edu/documents/1186/1998_005_001_16646.pdf)). The key insight for prioritization: NFRs conflict — "improving one often comes at the price of worsening one or more of the others" (ibid.). Concretely here: **end-to-end encryption** would improve confidentiality but was *ruled out* in ADR 0006 because "the AI Coach, the calc module, and the Head Coach all must read the data" — a documented security↔functionality trade-off. That is exactly what ATAM makes explicit. You don't need a formal 3-day ATAM; you need its habit of naming trade-offs.

- **Standards as sources for specific categories.** For accessibility, the requirement source is **WCAG**; for privacy, **GDPR**. Both give you ready-made, testable targets (Section 5).

---

## 5. A concrete starter NFR set for THIS project

Derived from `CONTEXT.md`, `OVERVIEW.md`, `docs/adr/0005` (Next.js + better-auth + Neon) and `docs/adr/0006` (server-authoritative), and the EU-residency/GDPR research already in this folder ([postgres-host-eu-residency-dpa.md](postgres-host-eu-residency-dpa.md), [gdpr-decisions.md](../mvp/gdpr-decisions.md)). Organized by ISO 25010 category. Each has a fit criterion. **★ = genuinely load-bearing for this app; ○ = real but secondary/boilerplate.** Targets are first-draft *proposals* to decide on, not settled values.

### Security ★ (the top priority — health-adjacent data + hosted LLM)

- **SEC-1 (data protection):** All athlete data encrypted in transit (TLS 1.2+) and at rest (provider encryption — Neon/Vercel). *Fit:* no plaintext data on the wire or at rest; verified by config audit. *Source:* ADR 0006 ("provider encryption at rest and in transit").
- **SEC-2 (identity separation):** Login identity (name, email — better-auth tables) is physically separated from training data, which is keyed only by an opaque athlete ID; training tables carry no name/email column. *Fit:* schema review confirms no PII columns in training tables; a leak of training data alone identifies no one. *Source:* ADR 0006 (verbatim design decision).
- **SEC-3 (authorization):** No endpoint returns data for an athlete the caller isn't authorized for; Coached Mode access is gated by Link Visibility per section. *Fit:* an authorization test suite covering athlete↔athlete and Head-Coach↔athlete boundaries passes 100%. *Source:* CONTEXT.md "Link Visibility", ADR 0006.
- **SEC-4 (no identity to the LLM):** No direct identifier is ever sent to the Anthropic API. *Fit:* prompt-construction unit tests assert absence of name/email/DOB/location in every prompt builder. *Source:* GDPR decision 1 (currently enforced in `poc/server.js`; must carry into the rebuild — flagged in ADR 0006).
- **SEC-5 (secret handling):** The Anthropic API key and DB credentials are server-only secrets, never shipped to the browser. *Fit:* no secret in client bundle; verified by build inspection. *Source:* ADR 0006 ("enter-your-API-key-in-the-UI pattern is retired").

### Privacy / Compliance ★ (GDPR — binding, health-adjacent, EU athletes)

- **PRIV-1 (data residency):** Athlete data at rest resides in the EU. *Fit:* Neon project in Frankfurt (`aws-eu-central-1`); Vercel functions in an EU region. *Source:* [postgres-host research](postgres-host-eu-residency-dpa.md) + ADR 0005 (Frankfurt, Vercel Pro EU region). *(Constraint, not just NFR.)*
- **PRIV-2 (DPA coverage):** A Data Processing Agreement is in force with every processor (DB host, app host, Anthropic) before real athlete data lands. *Fit:* DPAs concluded and recorded. *Source:* [postgres-host research](postgres-host-eu-residency-dpa.md).
- **PRIV-3 (data-subject rights):** An athlete can obtain export and full erasure of their data. *Fit:* erasure removes all rows within 30 days; verified by an integration test. *Source:* ADR 0006 ("a deletion path... becomes a real server feature"), gdpr-decisions.md B.
- **PRIV-4 (lawful basis / consent):** Processing of health-adjacent data has an explicit lawful basis (likely Art. 9 explicit consent) captured at onboarding, and the consent artifact discloses server storage and Anthropic as processor. *Fit:* consent flow present and logged before any data is processed. *Source:* gdpr-decisions.md A, ADR 0006 (consent artifact). *(Open legal question — see gdpr-decisions.md open questions 1 & 4.)*
- **PRIV-5 (data minimization):** Only data necessary for coaching is collected and transmitted. *Fit:* documented field-level justification; the LLM receives only Session Context, never the raw store. *Source:* CONTEXT.md "Session Context", gdpr-decisions.md 5.

### Reliability ★ (server is authoritative → its uptime = the app)

- **REL-1 (availability):** Coach API monthly availability ≥ 99.5% (≈3.6 h/month error budget). *Fit:* measured by uptime monitoring. *Source:* ADR 0006 (server single source of truth).
- **REL-2 (durability / no data loss):** No committed athlete write is lost (RPO = 0 for confirmed writes); on interruption the app shows an explicit offline state rather than failing silently. *Fit:* Postgres durability + "connection lost = the app says so and waits". *Source:* ADR 0006 ("No offline support... the app says so and waits").
- **REL-3 (LLM failure handling):** When the Anthropic API errors or times out, the Coach degrades gracefully (clear message, no corrupt plan written). *Fit:* fault-injection test confirms no partial/corrupt Week Plan persists on LLM failure. *Source:* derived from the Coach being an external dependency.

### Performance Efficiency ★ (interactive LLM — latency is felt)

- **PERF-1 (Coach responsiveness):** ≥95% of Coach Chat responses begin streaming within 3 s. *Fit:* server-side latency metric, rolling 7 days. *Source:* derived from US-2 ("get an answer... feels like a real coaching relationship") and Week 1 BOOM.
- **PERF-2 (UI responsiveness):** Core screens (Training Plan calendar, Session Drawer) interactive within 2 s on a mid-range device / typical connection. *Fit:* Core Web Vitals (LCP/INP) within Google "good" thresholds — already partly enforced by `eslint-config-next/core-web-vitals`. *Source:* eslint.config.mjs, CONTEXT.md calendar centrality.
- **PERF-3 (LLM cost):** Per-athlete monthly LLM cost stays within a set budget. *Fit:* cost/athlete tracked; alert on breach. *Source:* LLM-specific concern; not in repo yet — flagged. *(Cost is an NFR for LLM apps even though 25010 files it under resource utilization.)*

### Safety ★ (AI Coach gives training/recovery advice — real harm surface)

- **SAFE-1 (no medical advice):** The Coach never gives medical diagnoses or injury-treatment prescriptions; it stays within training coaching and defers health concerns to professionals. *Fit:* a red-team eval suite of health-risk prompts passes; the Coach Chat privacy notice already warns against sharing medical info. *Source:* CONTEXT.md (Coach scope), gdpr-decisions.md 3.
- **SAFE-2 (acute-signal handling):** On input signalling acute risk (chest pain, injury, illness), the Coach advises seeking care and does not push training load. *Fit:* eval scenarios verified. *Source:* derived from Contextual Signals / Check-in ("any notable health signals").
- **SAFE-3 (advice grounded, not hallucinated):** Training-science claims come from the Knowledge Oracle (RAG) or the deterministic calc module, not free hallucination. *Fit:* RAG citations present; calc via tool-use. *Source:* CONTEXT.md "Knowledge Oracle", ADR (calc as tested module via tool use). *(Also a runtime-guardrail concern — see the guardrails research doc, Part E.)*

### Interaction Capability / Accessibility ○→★ (onboarding friction is a named risk)

- **UX-1 (onboarding friction):** First-session onboarding completes quickly (MCQ before conversation). *Fit:* median time-to-first-Coach-message and onboarding completion rate tracked against a target. *Source:* CONTEXT.md Origin Story ("onboarding friction (too many fields before seeing value)" is a primary drop-off risk).
- **UX-2 (accessibility):** The app meets **WCAG 2.2 Level AA**. WCAG (Web Content Accessibility Guidelines) is the W3C's standard, organized under four principles — **Perceivable, Operable, Understandable, Robust** — across levels A/AA/AAA, with AA "the level required by most legislation" ([W3C WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/); [WCAG 2.2](https://www.w3.org/TR/WCAG22/)). *Fit:* automated axe scan + manual audit shows no Level A/AA violations on core flows. *Source:* 25010 "inclusivity" sub-characteristic; EU accessibility norms. *(Note: the EU Accessibility Act may make this a legal constraint, not just a quality goal — worth confirming for a Danish/EU consumer app.)*

### Maintainability ○ (matters for the AI-legibility goal)

- **MAINT-1 (clean gates):** Product code passes `eslint`, `tsc --noEmit`, and `vitest` before merge. *Fit:* CI green required (CI not yet wired — see guardrails research, Part F gap 3). *Source:* package.json scripts.
- **MAINT-2 (pure core):** Business logic (calc module, prompt rendering) stays framework-free and unit-tested. *Fit:* dependency rule enforced (no DB/HTTP imports in core). *Source:* [codebase-structure-guidelines.md](codebase-structure-guidelines.md), ADR 0005/0006 (ports as plain TS modules).

### Observability ○ (operational necessity for an LLM app)

- **OBS-1 (traceability):** Coach latency, error rate, token cost, and flagged unsafe outputs are logged and dashboarded. *Fit:* metrics exist for PERF-1, PERF-3, REL-1, SAFE-1. *Source:* derived — required to *verify* the ★ NFRs above; not in repo yet.

### Compatibility / Flexibility ○ (secondary at MVP scale)

- **COMPAT-1:** Garmin `.fit`/`.gpx` import parses the formats athletes actually export. *Fit:* a fixture corpus parses without error. *Source:* CONTEXT.md Historical Data Upload.
- **FLEX-1 (i18n):** UI and Coach support English + Danish; technical sport terms stay in English. *Fit:* both locales complete; `next-intl` already a dependency. *Source:* CONTEXT.md "Athlete Language", package.json (`next-intl`).
- **FLEX-2 (scalability):** Architecture handles growth from solo athletes to a Head Coach's roster without redesign. *Fit:* load test at target roster size. *Source:* ADR 0006 (server authority = "rows in a table" scales). Secondary until there's a real roster.

### What's load-bearing vs boilerplate — the honest cut

- **Genuinely load-bearing (get these right or the product fails or harms someone):** Security (SEC-1..5), Privacy/GDPR (PRIV-1..5), Safety of generated advice (SAFE-1..3), Coach reliability + no-data-loss (REL-1..3), Coach latency (PERF-1). These flow directly from three facts about *this* app: it handles **special-category health data**, it processes that data through a **hosted LLM**, and (post-ADR-0006) the **server owns the only copy**.
- **Real but secondary now:** accessibility (UX-2 — unless legally mandated, then it's ★), maintainability, observability, i18n, compatibility, scalability. These matter and belong in the list, but at MVP scale with a solo/small user base they won't sink the product the way a GDPR failure or an unsafe Coach reply would.
- **Watch for the trade-offs (ATAM habit):** SEC vs functionality (E2E encryption ruled out — ADR 0006); PERF/cost vs Coach quality (bigger context/model = better advice, higher latency and cost); privacy (data minimization) vs Coaching Presence (the more context the Coach holds, the better it coaches — the product's core value). Name these when you set the targets.

### Open questions for the user to decide

1. **Where do NFRs live?** Proposal: a new `docs/nfr.md` (or a short ADR per architecturally-significant NFR), cross-linked from `OVERVIEW.md`, so they sit beside CONTEXT.md and the ADRs rather than in chat.
2. **Actual targets.** The numbers above (99.5% uptime, p95 3 s, 30-day erasure) are first-draft proposals — pick the ones you'll actually commit to and test against.
3. **Is subjective self-reported training data "health data" under GDPR Art. 9?** This determines the required security/consent bar and is the single most consequential open legal question — already flagged in gdpr-decisions.md (open questions 1 & 4). It's a decision for the legal/domain track, but it *changes the priority* of PRIV-4 and SEC-*.
4. **Is WCAG AA a legal constraint (EU Accessibility Act) or a quality goal here?** Changes whether UX-2 is ★ or ○.
5. **LLM cost budget** — there is no cost NFR or observability in the repo yet; decide a per-athlete budget so PERF-3/OBS-1 have a target.

---

## Sources

Primary sources fetched or searched on 2026-07-20:

- ISO/IEC 25010:2023 (official text): https://www.iso.org/obp/ui/en/#!iso:std:78176:en ; catalog: https://www.iso.org/standard/78176.html
- ISO 25010 authors' summary portal: https://iso25000.com/index.php/en/iso-25000-standards/iso-25010
- ISO 25010:2023 change summary: https://quality.arc42.org/articles/iso-25010-update-2023
- ISO/IEC/IEEE 29148:2018 (requirements engineering; current edition, catalog 72089): https://www.iso.org/standard/72089.html
- Volere Requirements Specification Template (fit criterion): https://www.volere.org/templates/volere-requirements-specification-template/
- SEI ATAM (quality-attribute scenarios, utility tree, trade-offs): https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/ ; https://www.sei.cmu.edu/documents/1186/1998_005_001_16646.pdf
- W3C WCAG (accessibility): https://www.w3.org/WAI/standards-guidelines/wcag/ ; https://www.w3.org/TR/WCAG22/
- Repo files referenced: CONTEXT.md, OVERVIEW.md, docs/adr/0005-nextjs-better-auth-neon-stack.md, docs/adr/0006-server-authoritative-architecture.md, package.json, eslint.config.mjs, .scratch/research/postgres-host-eu-residency-dpa.md, .scratch/research/codebase-structure-guidelines.md, .scratch/mvp/gdpr-decisions.md
