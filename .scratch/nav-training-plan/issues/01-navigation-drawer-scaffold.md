Title: Navigation Drawer scaffold
Status: done

## What to build

Add a left-side Navigation Drawer to the POC. A toggle button (hamburger) sits fixed at the top-left of the viewport. Pressing it opens a drawer that slides in from the left and overlaps ~20% of the main content area. The drawer contains two nav buttons: "Coach" (active by default) and "Training Plan". Pressing a nav button closes the drawer. The Coach view (existing chat UI) remains visible and unchanged when the drawer is closed.

## Acceptance criteria

- [ ] Hamburger toggle button is always visible at top-left
- [ ] Pressing toggle opens the drawer from the left, overlapping ~20% of the view
- [ ] Drawer contains "Coach" and "Training Plan" nav buttons
- [ ] Pressing toggle again (or clicking outside) closes the drawer
- [ ] Drawer open/close is animated smoothly
- [ ] Existing Coach view is unaffected

## Blocked by

None — can start immediately

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): implemented in poc/public/js/app.js (drawer and view switching are visible in the running POC); status was stale-open. Set to done.
