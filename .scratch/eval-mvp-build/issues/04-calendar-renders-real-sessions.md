Status: ready-for-agent
Label: wayfinder:task

# 04 — The Training Plan calendar renders real sessions from Postgres

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The Training Plan calendar, rebuilt in React and reading real `sessions` rows for the signed-in athlete. Read-only in this slice — moving, rating, and creating arrive later.

The POC's `calendar.js` and its four calendar test files are the specification: month grid, the Week Plan as the planning unit, session dots by sport, day ordering via `day_order`. Read them for behaviour; do not port the DOM code.

Brings the `sessions` table — the full column set from the [signed-off schema](../../coach-eval-mvp-route/issues/05-server-data-model.md), including `origin` (coach|athlete|garmin|head_coach), even though only seeded sessions exist so far. `origin` is the column every authority rule later guards on; adding it now costs nothing and adding it later costs a migration plus a rewrite.

The seed script grows: a plausible Week Plan for Mads.

## Acceptance criteria

- [ ] The `sessions` table exists via migration with the full signed-off column set
- [ ] The seed script creates a Week Plan of sessions for Mads
- [ ] The calendar renders those sessions for the signed-in athlete, read server-side
- [ ] Sessions are ordered within a day by `day_order`
- [ ] An athlete sees only their own sessions — another athlete's rows never render
- [ ] The calendar's strings resolve through i18n in both `da` and `en`
- [ ] Tests cover the session query and the athlete-scoping rule
- [ ] Nothing reads `bh_sessions` or any localStorage key

## Blocked by

`.scratch/eval-mvp-build/issues/02-login-with-better-auth.md`
