Status: done (2026-07-18) — merged via PR #7. better-auth wired; signup mints one athlete row; identity separation structural (name on user.name, synthetic_label nullable + CHECK); routes 06/07 renames carried in migration 0001.
Label: wayfinder:task

# 02 — Logging in reaches your own athlete row

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

Authentication via better-auth, wired so that a logged-in person resolves to *their* athlete row and sees their own `display_name` on a protected page. Signed out, that page is unreachable.

This is where the identity-separation rule from [ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md) becomes structural: better-auth owns `user`, `session`, `account`, `verification`; the `athlete` row points at a user via `user_id`; and **no training table ever carries an email or a name**. All training data keys off the opaque athlete ID. Get this seam right here and every later slice inherits it.

Roles are rows you *have*, not things you *are* (ticket 05, ballot 1) — holding an athlete row makes you an athlete. Synthetic athletes keep `user_id` null and cannot log in; that is the mechanism, not an edge case.

**Signing up creates the athlete row** (Mads, 2026-07-17). This slice owns creation: slice 09 states plainly that "the athlete row already exists by this point — slices 01 and 02 created it", so onboarding fills a profile it never invents. A signup mints exactly one athlete row and links it, or the person lands signed-in on a page that cannot find them.

Two things were weighed and settled with it. It smudges ballot 1 — a `user` is supposed to be pure login identity, and minting an athlete row on signup quietly makes "user" mean "athlete", so someone signing up to coach gets an athlete row they never wanted. That costs one unused row in an eval where the coach is seeded and never signs up, and a coach-only signup path is additive later, not a reshape. And whether the registration route is *reachable on the public deployment* is a different question from whether signup provisions a row: an open registration form on a hosted app holding health data is a liability the eval gains nothing from. That question belongs to the route's still-open **security hardening** item — do not answer it here.

The seed script grows: Mads's athlete row now links to a real user.

**AMENDED 2026-07-17 (Mads, route tickets [06](../../coach-eval-mvp-route/issues/06-display-name-vs-identity-separation.md) + [07](../../coach-eval-mvp-route/issues/07-schema-names-vs-glossary.md)).** This slice also carries the `athlete` corrections both tickets ruled. They land here rather than in a schema-only slice — the PRD forbids one, and this is the slice where they demo: `user` arrives here, so a real name finally has somewhere to live, and criterion "no training table carries a name or email column" (below) is *false in the code today* until this runs.

**The name moves behind the `user_id` seam (06).** `athlete.display_name` becomes **`athlete.synthetic_label`**, **nullable**, populated **only for athlete rows with no `user_id`**. A real athlete's name is read from better-auth's `user.name` through the join this slice builds. `coach.display_name` is dropped by the same ruling, but that table doesn't exist until slice 11 — nothing to do here beyond not reintroducing it.

**The columns take their glossary names (07).** On `athlete`: `phase` → `training_phase`, `comm_style` → `communication_style`, `info_layout` → `information_view_layout`, `weekly_session_count` → `training_sessions_per_week`. Unchanged: `experience_level`, `race_target`, `equipment`, `profile`. Slice 04 brings the second table, so this is the last moment the rename is one migration and one schema file.

**The seed stops naming Mads in the training tables.** Slice 01 seeds him with **no `user_id`** — which makes his row synthetic by this schema's own definition, so `synthetic_label = 'Mads'` would put a real name in the one column that must hold only fabricated ones, and break ADR 0006's promise through the exact door 06 just closed. This slice gives him a user row: **his name goes to `user.name`, and his `athlete.synthetic_label` is null.** Any synthetic athlete keeps a fabricated label.

**Slice 01's page changes with it.** It renders `display_name` today; after this slice a real athlete's name resolves through user → athlete. That is this slice's own criterion, not extra work — but do not leave the walking skeleton reading a column that no longer holds a real name.

## Acceptance criteria

- [ ] better-auth is wired with the Drizzle adapter; its tables exist via migration
- [ ] A person can sign up, sign in, and sign out
- [ ] Signing up creates exactly one athlete row, linked to the new user via `user_id`; the person reaches the protected page without a seed script having run for them
- [ ] Repeating a signup or a provisioning attempt never yields a second linked row: `athlete.user_id` carries a unique constraint. It stays nullable, and Postgres permits many nulls, so synthetic athletes are untouched by it
- [ ] The session survives a page refresh
- [ ] A protected page renders the signed-in person's own name, resolved from user → athlete — read from better-auth's `user.name`, not from a training table (amended 2026-07-17, route 06)
- [ ] `athlete.display_name` is renamed to `synthetic_label` and made nullable; it is null for every athlete row that has a `user_id`, and set only for those without one (route 06)
- [ ] The `athlete` columns carry their glossary names: `training_phase`, `communication_style`, `information_view_layout`, `training_sessions_per_week` (route 07)
- [ ] The seed writes Mads's name to `user.name` and leaves his `athlete.synthetic_label` null; seeded synthetic athletes carry a fabricated label
- [ ] Signed out, that page redirects to sign-in rather than rendering or erroring
- [ ] An athlete row with a null `user_id` (synthetic) has no login path
- [ ] No training table carries a name or email column
- [ ] The seed script links Mads's athlete row to a seeded user
- [ ] Tests cover the user → athlete resolution, the signed-out case, and that a repeated signup leaves exactly one linked athlete row

## Blocked by

`.scratch/eval-mvp-build/issues/01-walking-skeleton.md`
