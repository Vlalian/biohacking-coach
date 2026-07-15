Status: done (2026-07-15) — notes: panel gates for ffnow/load/ramp tightened to `fitness != null` (honest on real data, no synthetic-state change); `DATASET_STATES` split into `SYNTHETIC_STATES` + 'mine'; smiley 1–5 feedback maps ×2 onto the 1–10 panel axis (POC mapping, comment in code); stream helpers (streamKey/getStreams/setStreams) moved into store.js and deleteSession now removes the stream key.

# 04 — Real data in the Information View

## Parent

`.scratch/garmin-sync/PRD.md`

## What to build

`infodata.js` gains a third dataset state `'mine'` alongside `fresh`/`rich`: the same dataset shape, built from `bh_sessions` entities and `bh_stream_*` streams instead of the seeded PRNG. This exercises the existing seam — panels, catalog, layout, and comparison code do not change shape.

- The data-state toggle offers "My data" only when at least one `source: 'garmin'` session exists; `fresh`/`rich` remain as demo states. Label via EN + DA keys.
- Session-derived collections (weekly hours, session counts, Body/Mind where rated) come from entities; stream-derived, wearable-gated collections (zones, peaks, bests) come from streams and populate only for channels that actually exist in at least one upload. A channel absent everywhere keeps its gated panels unrendered — the one-reading rule is unchanged.
- Zones placeholder: %-of-observed-max-HR bands, marked in a code comment as a POC stand-in — real zones come from field tests via the future calc module (round-2 expert ruling). No TSS-family metrics anywhere in this slice.
- Ordering invariant: all built collections oldest→newest (the reversed-array bug class from the provider's birth — run the same invariant tests over `'mine'`).

## Acceptance criteria

- [ ] With zero imported sessions, the toggle shows only the two synthetic states; after one import, "My data" appears and renders
- [ ] `'mine'` passes the same dataset-shape and ordering invariant tests as `fresh`/`rich`
- [ ] An upload with HR but no power lights HR-based panels and leaves power-gated panels unrendered
- [ ] Panels render real values consistent with the uploaded fixture (spot-check: weekly hours match imported durations)
- [ ] Comparison Graph and Enlarge work unchanged on `'mine'` panels
- [ ] All new labels resolve through EN + DA translation keys; existing suite stays green

## Blocked by

02 — needs imported entities + streams in storage. (03 not strictly required, but rating data enriches Body/Mind panels.)
