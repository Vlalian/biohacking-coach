# Information View: parity + adjustability instead of curation

The app's instinct everywhere else is curated minimalism — the Coach translates, hides raw scores, shows only what's actionable. For the Information View we decided the opposite (Mads, 2026-07-14, "startup truth"): full reference-app (TrainingPeaks) panel parity, shown to both athlete and Head Coach, with the *user* curating via adjustability (Favorites zone + drag-reorder) rather than the app deciding what matters. Comparison (Session Comparison, Period Comparison) is the second pillar.

The tension with curated minimalism is resolved two ways: adjustability makes the panel wall self-curating per user, and the one-reading rule (a panel renders only once a single data point exists — Progressive Disclosure, reinterpreted) means a new athlete's page starts nearly empty and grows honestly with their history. The invisible-coaching model is untouched: panels show data, never Pattern Insights; the Coach still speaks natural language.

## Consequences

- Head Coach reaches the Information View per athlete via Roster View — same component, coach permissions, Link Visibility gating (unshared sections render no panels). The "no athlete-comparison dashboards" ruling stands; roster-wide analysis is the Roster Briefing (conversational, patterns-and-recommendations only, never a coach grade — V2).
- One layout per Head Coach, applied to every athlete on the roster.
- Panels cannot be hidden, only demoted out of Favorites.
- Feature-unlocking Progressive Disclosure is retired; data accumulation is the disclosure mechanism.
- POC scope: athlete-side complete on synthetic data (staging decision 2026-07-14); Head Coach render deferred to V1 with Coached Mode; nothing faked.
