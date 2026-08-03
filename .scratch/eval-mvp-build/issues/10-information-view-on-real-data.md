Status: done (2026-07-24) — merged via PR #17. The Information View renders real sessions/feedback/streams; layout persists; Period Comparison added (ADR 0004 second pillar).
Label: wayfinder:task

# 10 — The Information View runs on real data

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The Information View, rebuilt in React and reading the athlete's real sessions and streams from Postgres — retiring the synthetic data provider for good.

`poc/public/js/infodata.js` is a **seeded-PRNG synthetic data provider**, deliberately built as the seam where real sources plug in ("nothing outside this module may fabricate Information View data"). This slice is that plug-in moment. The provider does not port; the seam's *contract* does. Its named dataset states (`fresh` = week 1, `rich` = 26 weeks) remain useful as test fixtures — keep them for tests, not for the running app.

The POC's `infoview.js`, `infolayout.js`, `infocompare.js`, `panels.js` and their five test files specify the behaviour: favourites, ordering, the range the athlete thinks in, and this-block-against-the-last comparison. See [ADR 0004](../../../docs/adr/0004-information-view-parity-and-adjustability.md).

`information_view_layout` JSONB on `athlete` persists favourites, order, and range — already in the signed-off schema (renamed from `info_layout` by [route 07](../../coach-eval-mvp-route/issues/07-schema-names-vs-glossary.md), applied in slice 02).

Note what this slice does **not** include: the derived training-load metrics, zone analysis, and phase detection that a calc module would provide. That module does not exist and is not a port. Build the view against what the schema actually holds — sessions, feedback, and streams.

## Acceptance criteria

- [ ] The Information View renders from real sessions, feedback, and streams for the signed-in athlete
- [ ] `infodata.js`'s synthetic provider is not ported into the running app
- [ ] Its `fresh`/`rich` dataset states survive as test fixtures
- [ ] Favourites, ordering, and range persist to `information_view_layout` and survive a refresh
- [ ] Block-against-block comparison works per ADR 0004
- [ ] An athlete with no data yet gets a sensible empty state rather than an error
- [ ] View strings resolve through i18n in both `da` and `en`
- [ ] Tests cover the layout persistence and the empty state

## Blocked by

`.scratch/eval-mvp-build/issues/06-garmin-upload-lands-real-data.md`
`.scratch/eval-mvp-build/issues/07-session-reflection.md`
