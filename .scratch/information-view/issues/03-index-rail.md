Status: done (2026-07-14)

# 03 — Index Rail

## Parent

`.scratch/information-view/PRD.md`

## What to build

The winning prototype layout, real: a grouped index rail beside the panel feed.

- The rail lists every available panel grouped by family (Form & Load, Body & Mind, Volume, Peaks & Zones), sticky while the feed scrolls, collapsing to a stacked layout on narrow viewports.
- Clicking a rail entry scrolls the feed to that panel.
- The feed order matches the rail order. Panels without a reading appear in neither (one-reading rule unchanged).
- Family names and any rail labels ship EN + DA keys.

Favorites are NOT in this slice — the rail shows only family groups until issue 04 adds the ★ group.

## Acceptance criteria

- [ ] Information View renders rail + feed; rail groups match panel families and contain only available panels
- [ ] Clicking a rail entry scrolls its panel into view (tested in jsdom via an exported handler, not synthetic mouse events)
- [ ] Rail is sticky alongside the scrolling feed on desktop widths and stacks on narrow viewports
- [ ] Switching dataset state (`fresh`/`rich`) updates the rail and feed together
- [ ] EN + DA keys for all new labels; suite green

## Blocked by

`.scratch/information-view/issues/02-full-catalog-one-reading-growth.md`
