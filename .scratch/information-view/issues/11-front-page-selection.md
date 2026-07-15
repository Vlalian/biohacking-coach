Status: future — needs a short design pass (grill or prototype) before build

# 11 — Front-page information selection

## Parent

`.scratch/information-view/PRD.md` (idea #12 of the second mining pass, Mads 2026-07-15)

## What to build (draft)

Adjustability extends beyond the Information View: the athlete chooses which information/graphs also surface on the app's front page (the Coach view / home surface), managed *from* the Information View. Essentially the prototype's Glance Strip variant reborn on the home surface — chosen panels render as compact tiles (headline value + sparkline) above or beside the Coach conversation.

## To decide before building

- Which surface exactly: above the check-in card in the Coach view? A separate home strip? Collapsible?
- Which control selects: the existing Favorites (stars do double duty) or a separate "pin to front page" control (favorites ≠ front-page material)?
- Tile form: the glance() shape from the retired prototype variant C (headline + label + sparkline) is the obvious starting point.
- Coach-view philosophy: the Coach view is a conversation; tiles must not turn it into a dashboard. How much is too much (cap the strip?).

## Blocked by

Design pass with Mads. No code before the decisions above.
