# Information View: parity + adjustability instead of curation

Status: accepted (2026-07-14) · amended 2026-08-25

The app's instinct everywhere else is curated minimalism — the Coach translates, hides raw scores, shows only what's actionable. For the Information View we decided the opposite (Mads, 2026-07-14, "startup truth"): full reference-app (TrainingPeaks) panel parity, shown to both athlete and Head Coach, with the *user* curating via adjustability (Favorites zone + drag-reorder) rather than the app deciding what matters. Comparison (Session Comparison, Period Comparison) is the second pillar.

The tension with curated minimalism is resolved two ways: adjustability makes the panel wall self-curating per user, and the one-reading rule (a panel renders only once a single data point exists — Progressive Disclosure, reinterpreted) means a new athlete's page starts nearly empty and grows honestly with their history. The invisible-coaching model is untouched: panels show data, never Pattern Insights; the Coach still speaks natural language.

## Consequences

- Head Coach reaches the Information View per athlete via Roster View — same component, coach permissions, Link Visibility gating (unshared sections render no panels). The "no athlete-comparison dashboards" ruling stands; roster-wide analysis is the Roster Briefing (conversational, patterns-and-recommendations only, never a coach grade — V2).
- One layout per Head Coach, applied to every athlete on the roster.
- Panels cannot be hidden, only demoted out of Favorites.
- Feature-unlocking Progressive Disclosure is retired; data accumulation is the disclosure mechanism.
- POC scope: athlete-side complete on synthetic data (staging decision 2026-07-14); Head Coach render deferred to V1 with Coached Mode; nothing faked.

## Amendment 2026-08-25 — Both consequences above are out of date, and the second pillar has two names

Checked against `src/` rather than against the other documents, per the standing rule in `AGENTS.md`. Two of this ADR's claims no longer describe the code, and one of them is a contradiction that needs a decision rather than an edit.

**The Head Coach render is built, not deferred.** The consequence above says it is "deferred to V1 with Coached Mode". It shipped: [`src/app/[locale]/coach/athlete/[athleteId]/page.tsx:15`](../../src/app/[locale]/coach/athlete/[athleteId]/page.tsx) imports the athlete's own `InformationView` component and renders it under coach permissions, and `coach.informationViewLayout` (same file, line 63) holds the one-layout-per-Head-Coach rule this ADR specified. Link Visibility gating is enforced server-side in [`src/features/coach/link-visibility.ts`](../../src/features/coach/link-visibility.ts), which strips withheld data before it crosses to the browser rather than hiding it in the UI. The design was implemented as written; only the schedule note is stale. The "POC scope" framing is obsolete too — the POC was retired by ADRs 0005 and 0006.

**Period Comparison was declared replaced and was never removed.** This ADR names the second pillar as "Comparison (Session Comparison, Period Comparison)". `CONTEXT.md`'s Comparison entry says Period Comparison was *"Replaced … 2026-07-15, before any user met it"* by the athlete-composed **Comparison Graph**. The code says both exist:

- **Comparison Graph** is built — the 0–1 normalization that lets series with different units share a chart is at [`src/features/information-view/compare.ts:84`](../../src/features/information-view/compare.ts).
- **Period Comparison is also built, and live.** `periodSplit` and the `PeriodComparison` type are at [`src/features/information-view/panels.ts:152-166`](../../src/features/information-view/panels.ts), called and rendered as a real panel by the `Period` component at [`src/app/[locale]/(app)/information/panel-body.tsx:278`](../../src/app/[locale]/(app)/information/panel-body.tsx) — a this-block-against-last table of hours, completed, skipped, longest, body and mind. It has its own tests.

So `CONTEXT.md`'s "replaced, before any user met it" is **false**: the replacement decision was taken and the panel was never taken out, which means every athlete who has opened the Information View has met it. The panel's own doc comment still cites *"Period Comparison (ADR 0004's second pillar)"*, so the code is internally consistent with this ADR and inconsistent with the glossary.

**This ADR is not the place to resolve it.** Two defensible readings — that the 2026-07-15 decision stands and the panel is undeleted work, or that the panel earned its place and the decision should be reversed — and they lead to opposite edits. Mads's call. Recorded here rather than fixed quietly so the next reader does not trust either document over the code. Until it is settled, **the code is what is true: both comparison forms ship.**
