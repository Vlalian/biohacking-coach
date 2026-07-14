Status: ready-for-agent

# 04 — Favorites: star + persistence

## Parent

`.scratch/information-view/PRD.md`

## What to build

Curation arrives: the athlete stars panels into Favorites, and the arrangement survives reload.

- Every panel (in the rail and on the panel card) carries a star. Starring promotes the panel into the ★ Favorites group — pinned first in both rail and feed; unstarring demotes it back into its family. Demote-only: a panel can never be hidden or removed.
- A **layout store** holds Favorites membership and order in a `bh_`-prefixed localStorage key, with pure operations (promote, demote, reorder) separated from storage — the calendar route's store/rules split.
- First run seeds the default Favorites set: Form Today, Load History, Body & Mind Feedback, Sleep & Feeling (placeholder until expert § 13 answers tune it).
- A favorited panel that loses its reading (e.g. `fresh` state) stays in the stored layout but does not render — the layout is a preference; what renders is gated by data. It reappears when the data does.

## Acceptance criteria

- [ ] Starring moves a panel into the ★ group (first in rail and feed); unstarring returns it to its family — verified via exported handlers in jsdom
- [ ] Favorites membership and order survive a reload (localStorage round-trip test)
- [ ] First run shows the default Favorites set; unknown panel ids in a stored layout are ignored without error
- [ ] No hide anywhere: every available panel is always reachable in rail and feed
- [ ] In `fresh` state a favorited wearable-dependent panel is absent from display but retained in the stored layout
- [ ] EN + DA keys for new labels (e.g. Favorites group title); suite green

## Blocked by

`.scratch/information-view/issues/03-index-rail.md`
