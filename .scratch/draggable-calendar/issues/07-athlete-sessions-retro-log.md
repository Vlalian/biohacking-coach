Status: done
Route position: 7 of 8 (Calendar Implementation Route)

# 07 — Athlete Sessions + retro-log

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

The athlete authors their own sessions. Each day in an Expanded Week gains a "+" affordance opening the Session Drawer in create mode: type (Mobility, Strength, Other), a training/not-training toggle for Other (Mobility fixed not-training, Strength fixed training), optional title, duration, and note. New Session Type colours: Strength purple, Mobility teal, Other neutral grey.

Athlete Sessions are full session entities — movable, stackable into Doubles, skippable, rateable — and are editable and deletable in the drawer (unlike Coach content). Load rules: training-typed Athlete Sessions follow all training rules including Displacement parking; non-load ones coexist with Rest. On Rest days the create form offers only non-training options. Retro-logging: "+" also works on **any past day** (no deadline on recording reality — round-2 expert ruling, 2026-07-12), creating the session as already completed and chaining straight into the feedback prompt. Past weeks stay frozen for moving and editing existing sessions; retro-log creation is the one action that reaches them. Creation is silently logged.

**Copy ruling (round-2 expert):** Strength is athlete territory — any Coach-side mention of Strength suggestions is framed as "for those who want extra", never as prescribed load.

## Acceptance criteria

- [ ] "+" on today/future days creates a planned Athlete Session rendered with its type colour
- [ ] Other's toggle sets load behavior; Mobility/Strength toggles are fixed
- [ ] On Rest days the form offers only Mobility and Other locked to not-training; created sessions coexist with Rest
- [ ] Training-typed Athlete Sessions park when dropped on Rest days and form Doubles like any training
- [ ] Athlete Sessions are editable and deletable in the drawer; Coach sessions remain neither
- [ ] "+" on any past day creates a completed session and opens the rating prompt immediately; existing sessions in past weeks remain frozen (no move, no edit)
- [ ] Creation appends to the silent log; store/rules/DOM tests cover creation, editing, deletion, Rest-day filtering, and retro-log; translation keys tested

## Blocked by

`.scratch/draggable-calendar/issues/03-session-drawer.md`, `.scratch/draggable-calendar/issues/04-within-week-session-move.md`

## Resolution

Implemented 2026-07-13 (commit c70c2b9); all acceptance criteria covered by tests, suite green.
