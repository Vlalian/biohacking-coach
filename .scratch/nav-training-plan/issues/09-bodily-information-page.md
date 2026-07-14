Title: Information View
Status: ready for PRD — scope reset 2026-07-14 by the STARTUP TRUTH (see `../reference-app-review.md`); terminology grill session completed same day (CONTEXT.md updated, ADR-0004 written). Expert answers (interview guide § 13) shape the default Favorites set, not inclusion.

## What to build

The **Information View** (canonical term — see CONTEXT.md): a new View in the Navigation Drawer where the athlete — and, in Coached Mode, the Head Coach per athlete via Roster View — oversees training and bodily information.

## Grill session outcomes (2026-07-14, all in CONTEXT.md)

- **Panel / Panel Catalog / Favorites** — panel = the unit; catalog = full parity set, always all shown (no hiding, only demoting); Favorites = starred top zone, drag-reorder within zones, per-user persisted.
- **One-reading rule** — a panel renders as soon as a single data point exists, never before. Replaces feature-unlocking Progressive Disclosure; new athlete's page starts nearly empty and grows.
- **Head Coach** — same component per athlete, coach permissions, Link Visibility gating; ONE layout applied across the whole roster; no cross-athlete surface (Roster View ruling stands).
- **Roster Briefing** (new term, V2) — conversational roster-wide AI analysis of the Head Coach's own coaching; patterns and recommendations only, never a grade.
- **Comparison** — Session Comparison (2+ completed sessions side by side incl. Session Feedback; any selectable, filters guide same-kind) + Period Comparison (one panel, two time ranges). Extensible with more forms later.
- **POC scope** — athlete-side complete on synthetic data (full catalog, Favorites+move, both comparison forms, new-athlete vs rich-history demo states); Head Coach render deferred to V1 with Coached Mode; Roster Briefing recorded only.

## Prototype verdict (2026-07-14)

Three layout variants were prototyped in the POC (`poc/public/js/infoview.prototype.js`) and Mads picked the winner:

- **Winner: Index Rail** — a grouped index rail on the left (★ Favorites first, then panel families: Form & Load, Body & Mind, Volume, Peaks & Zones) beside a single-column feed of large panels, favorites pinned to the top of both. Clicking a rail entry scrolls to the panel; the star promotes/demotes.
- **Losers: Two-Zone Wall** (favorites grid above catalog grid) and **Glance Strip** (favorites as KPI tiles + one focus panel). Deleted from the prototype; the winner remains live in the POC as the Information view, still on synthetic data.
- Glossary impact: the Favorites *model* (star = membership, per-user order, demote-not-hide) is unchanged; only its rendering is now rail + feed rather than two stacked grids.

Open questions carried to the PRD:
- One-reading rule at week 1 shows 12 of 15 panels (only wearable-dependent ones absent) — honest growth or still a wall? May need fewer default favorites or a family-collapsed rail for new athletes.
- Comparison shape confirmed working (session picker → side-by-side incl. Body/Mind; ⇄ period overlay) but not yet judged in anger.
- Drag-reorder of favorites (rail order) not in the prototype — spec it in the PRD.

## Startup truth (Mads, 2026-07-14) — the foundation

1. **TrainingPeaks parity.** Every panel family the reference app's dashboard offers should be available and shown in both the athlete UI and the Head Coach UI: load history (fitness/fatigue/form over time), sport-split summaries (completed/planned duration and distance), peaks tables and best-effort curves, time-in-zone charts, weekly bars (longest workout, elevation, calories), and the body panel (sleep + subjective feeling) — inventoried in `../reference-app-review.md`.
2. **Adjustability.** Graphs can be moved and favorited so each user arranges their most important information for at-a-glance access. Layout is per-user (each athlete and each Head Coach has their own arrangement).
3. **Comparison.** The user can select multiple training sessions and compare them to see progression, or compare bodily information across time — the reference app's Workout Comparison table generalized into a compare feature.

## Superseded draft scope

The earlier draft (This Month / Check-in Trends / Body Signals Today as a small curated page) is superseded — those become panels among the rest, not the whole page. "Pattern insights excluded" still holds: panels show data, never Coach-derived interpretations.

## Execution rules carried over from the reference review

- No dead empty-state panels — a panel without a live data source is not addable/visible.
- The Coach's speech rules are unchanged: the page shows numbers; the Coach still talks in natural language.

## Open points

- **Data staging DECIDED (Mads, 2026-07-14): synthetic data first.** The POC builds the full page — all panel families, adjustability, comparison — on realistic fake data, consistent with the rest of the POC. Wearable integration is its own later project; no panel ships wired to a real source until then. (The no-dead-panels rule applies to the real product; in the POC every panel has synthetic data by definition.)
- Expert answers (§ 13) → sensible *default* layout and favorites for a new athlete, and validation of which panels matter.
- Terminology grill session to pin new terms (panel, favorite, compare set, …) into CONTEXT.md before build.
