Status: ready-for-agent

# PRD — Information View

Sources of truth: CONTEXT.md (Information View, Panel, Panel Catalog, Favorites, Comparison, Progressive Disclosure), `docs/adr/0004-information-view-parity-and-adjustability.md`, prototype verdict in `.scratch/nav-training-plan/issues/09-bodily-information-page.md`. Use the glossary vocabulary exactly.

## Problem Statement

The athlete trains for months and generates a rich trail of data — sessions completed and skipped, Body and Mind Feedback, check-in signals, sleep, load — but has nowhere to *see* any of it. The Coach uses it silently; the athlete who wants to oversee their own progress and bodily information is blind. Reference apps (TrainingPeaks) solve this with a wall of twenty analytics panels that nobody curates for you, that render dead "no data" placeholders, and that bury body signals in one small chart. The athlete needs everything available without inheriting the wall.

## Solution

A new **Information View** in the Navigation Drawer. Every Panel in the Panel Catalog is on the page — nothing hidden, nothing locked — organized as an **index rail**: a grouped rail listing ★ Favorites first, then the catalog by panel family (Form & Load, Body & Mind, Volume, Peaks & Zones), beside a single-column feed of large panels in the same order. Clicking a rail entry scrolls to its panel. The star promotes a panel into Favorites or demotes it back — the *user* curates the wall, the app never hides anything.

A Panel renders as soon as one reading exists for it, and never before (the one-reading rule — Progressive Disclosure, reinterpreted). A new athlete's page starts small and grows honestly with their history.

Comparison lives inside the view: **Session Comparison** (pick 2+ completed sessions from a filterable picker, see them side by side — parameters, outcomes, and Body/Mind Feedback next to the numbers, which no reference app can show) and **Period Comparison** (a ⇄ toggle on time-series panels overlaying the previous equal-length period, dashed).

All data is synthetic in this build (staging decision 2026-07-14): a deterministic generator behind a data-provider seam, with a "new athlete" and a "6 months in" state so the one-reading growth is demonstrable. Real sources (entity store, wearables) plug in behind the same seam later.

## User Stories

1. As an athlete, I want one place showing all my training and bodily information, so that I can oversee my own progress without asking the Coach.
2. As an athlete, I want to star the panels I care about and have them pinned first in the rail and the feed, so that my most important information is one glance away.
3. As an athlete, I want to reorder my Favorites, so that the order matches how I scan.
4. As an athlete, I want panels I don't care about demoted but never gone, so that nothing is ever hidden from me.
5. As a new athlete, I want the page to show only panels that have at least one reading, so that I never stare at dead placeholders — and I see the page grow as I train.
6. As an athlete, I want to select two or more completed sessions and compare them side by side — including how they felt (Body/Mind) — so that I can see my progression.
7. As an athlete, I want to flip a panel into "vs previous period" mode, so that I can compare this block against the last one.
8. As a Danish athlete, I want the Information View in my Athlete Language, so that the whole app speaks one language.

## Implementation Decisions

Five modules, mirroring the calendar route's architecture (pure logic + store + thin orchestrator):

1. **Panel Catalog (pure module)** — the full catalog as data: each Panel declares id, family, title, its one-reading predicate over a dataset, an optional period-compare capability, and a render function producing markup from (dataset, options). Panels show data, never Coach-derived interpretation — no Pattern Insights, ever (ADR-0004). No dead empty-state panels: a Panel whose predicate is false does not render at all. Initial catalog = the parity families inventoried in the reference-app review (~15 panels: Form Today, Race Countdown, Load History, Consistency; Body & Mind Feedback, Check-in Signals, Sleep & Feeling; Sport Splits, Weekly Hours, Longest Workout, Weekly Work; Time in Zones, Peak Power, Peak HR).
2. **Synthetic data provider** — a seeded, deterministic generator exposing named dataset states: `fresh` (week 1) and `rich` (26 weeks). This is the seam where the entity store and wearable data later plug in; nothing outside it may fabricate data. All values synthetic per the 2026-07-09 privacy rule.
3. **Layout store** — Favorites membership and order persisted in a `bh_`-prefixed localStorage key, with pure operations (promote, demote, reorder) separated from storage. Default Favorites set for new users: Form Today, Load History, Body & Mind Feedback, Sleep & Feeling — a placeholder until the expert's § 13 answers tune it. Demote-only: there is no hide.
4. **Comparison logic (pure module)** — session-picker filtering (by sport, by Session Type), the 2+ selection rule, attribute extraction for side-by-side columns (always including Body Feedback and Mind Feedback), and the period-split math for Period Comparison (current vs previous equal-length window).
5. **View orchestrator (thin)** — renders the index rail + feed from catalog × data × layout, wires star/jump/compare interactions, hosts the Session Comparison overlay, and provides drag-reorder of Favorites (rail order). Replaces the prototype module entirely — the prototype (`infoview.prototype.js`) is deleted when this lands.

Cross-cutting:
- The View registers in the Navigation Drawer and the View switcher as `information` (already wired).
- A prototype-banner control (POC convention) switches the dataset state (`fresh`/`rich`) to demonstrate one-reading growth; it is not an athlete-facing feature.
- EN + DA translation keys for all labels, per the ported convention — the prototype's hardcoded English does not carry over.
- Head Coach rendering, Link Visibility gating, and Roster Briefing are V1/V2 (ADR-0004) — nothing in this build may assume a Head Coach exists.

## Testing Decisions

- Table-driven tests for the Panel Catalog: for every panel, predicate false on an empty dataset and true with exactly one reading; render output contains no `NaN`, no empty-state copy.
- Determinism tests for the data provider: same state name → identical dataset; `fresh` and `rich` satisfy shape invariants the catalog depends on.
- Layout store tests: default set on first run, promote/demote/reorder round-trip through localStorage, unknown panel ids ignored (forward-compatible).
- Comparison logic tests: filter matrix, selection threshold, period-split boundaries (odd lengths, single-reading datasets).
- Orchestrator story tests in jsdom via exported handlers (star click, rail jump, compare open→select→go, drag-reorder handler) — no synthetic mouse gestures, per the calendar convention.
- Prior art: the calendar route's suites (rules matrix tests, store persistence tests, moves story tests, jsdom drop-handler tests).

## Out of Scope

- Real data sources: entity-store-backed panels and wearable integration (separate later project behind the data-provider seam).
- Head Coach render of the Information View, Link Visibility gating (V1, with Coached Mode) and Roster Briefing (V2).
- Custom date-range pickers for Period Comparison — the ⇄ "vs previous period" toggle is the only form in this build; more Comparison forms are deliberately extensible later.
- Coach conversational integration: Guided Tour introduction of the view (ADR-0001 moment TBD) and Panel References in the Coaching Channel.
- Pattern Insights or any Coach interpretation on panels — permanently out, not just deferred (ADR-0004).
- Per-panel minimum-reading thresholds beyond the one-reading default.

## Further Notes

**Post-build amendment (Mads, 2026-07-15), after reviewing the implemented page:** (1) feed lays out two panels per row, rail + feed filling the container width; (2) the rail is pure navigation — no stars, no favorite highlighting (stars live on panel cards; this also fixed an invalid nested-`<button>` bug the rail stars caused in real browsers); (3) **Period Comparison is replaced by the Comparison Graph** — the athlete composes one large combined chart by pressing ⇄ on any series-bearing panel (series normalized to their own range; chips to remove; Clear); (4) new **enlarge** control (⛶) on every panel spans it full-row with a proportionally taller chart. CONTEXT.md and issue 07 updated accordingly.

- Prototype verdict (2026-07-14): Index Rail won over Two-Zone Wall and Glance Strip; the winning layout is live in the POC on synthetic data as `infoview.prototype.js` — treat it as a visual spec, not as code to promote (written under prototype constraints: no persistence, no i18n, no tests).
- Open design question carried from the prototype: under the one-reading rule a week-1 athlete already sees 12 of 15 panels. If that reads as a wall rather than honest growth, the levers are a smaller default Favorites set or a collapsed-by-default rail for non-favorite families — decide during build or after expert § 13 answers.
- The expert's § 13 answers (interview guide) tune the default Favorites set and validate panel priorities; they do not change what is included (startup truth: everything is available and shown).
- Privacy rule (2026-07-09) applies to all fixtures and docs: synthetic values only; never persist the expert's real health/training values.
