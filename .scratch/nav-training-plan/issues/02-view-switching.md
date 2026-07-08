Title: View switching — Coach ↔ Training Plan
Status: ready-for-agent

## What to build

Wire the nav buttons in the Navigation Drawer to switch the Main View. Pressing "Training Plan" hides the Coach view and shows a Training Plan placeholder (header + empty content area). Pressing "Coach" returns to the existing chat UI. The active view is indicated visually in the drawer. State is preserved when switching — returning to Coach view shows the conversation where it was left.

## Acceptance criteria

- [ ] "Training Plan" button switches to the Training Plan view
- [ ] "Coach" button switches back to the Coach view
- [ ] Active nav item is visually highlighted in the drawer
- [ ] Coach conversation state is preserved across view switches
- [ ] Training Plan view shows a labelled placeholder (no calendar data yet)

## Blocked by

- 01-navigation-drawer-scaffold
