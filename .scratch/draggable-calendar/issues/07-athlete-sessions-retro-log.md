Status: ready-for-agent

# 07 — Athlete Sessions + retro-log

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

The athlete authors their own sessions. Each day in an Expanded Week gains a "+" affordance opening the Session Drawer in create mode: type (Mobility, Strength, Other), a training/not-training toggle for Other (Mobility fixed not-training, Strength fixed training), optional title, duration, and note. New Session Type colours: Strength purple, Mobility teal, Other neutral grey.

Athlete Sessions are full session entities — movable, stackable into Doubles, skippable, rateable — and are editable and deletable in the drawer (unlike Coach content). Load rules: training-typed Athlete Sessions follow all training rules including Displacement parking; non-load ones coexist with Rest. On Rest days the create form offers only non-training options. Retro-logging: "+" also works on past days of the current week, creating the session as already completed and chaining straight into the feedback prompt. Past weeks stay frozen. Creation is silently logged.

## Acceptance criteria

- [ ] "+" on today/future days creates a planned Athlete Session rendered with its type colour
- [ ] Other's toggle sets load behavior; Mobility/Strength toggles are fixed
- [ ] On Rest days the form offers only Mobility and Other locked to not-training; created sessions coexist with Rest
- [ ] Training-typed Athlete Sessions park when dropped on Rest days and form Doubles like any training
- [ ] Athlete Sessions are editable and deletable in the drawer; Coach sessions remain neither
- [ ] "+" on a current-week past day creates a completed session and opens the rating prompt immediately; past weeks have no "+"
- [ ] Creation appends to the silent log; store/rules/DOM tests cover creation, editing, deletion, Rest-day filtering, and retro-log; translation keys tested

## Blocked by

`.scratch/draggable-calendar/issues/03-session-drawer.md`, `.scratch/draggable-calendar/issues/04-within-week-session-move.md`
