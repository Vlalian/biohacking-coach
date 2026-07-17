Status: ready-for-agent
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

## Acceptance criteria

- [ ] better-auth is wired with the Drizzle adapter; its tables exist via migration
- [ ] A person can sign up, sign in, and sign out
- [ ] Signing up creates exactly one athlete row, linked to the new user via `user_id`; the person reaches the protected page without a seed script having run for them
- [ ] Repeating a signup or a provisioning attempt never yields a second linked row: `athlete.user_id` carries a unique constraint. It stays nullable, and Postgres permits many nulls, so synthetic athletes are untouched by it
- [ ] The session survives a page refresh
- [ ] A protected page renders the signed-in person's own athlete `display_name`, resolved from user → athlete
- [ ] Signed out, that page redirects to sign-in rather than rendering or erroring
- [ ] An athlete row with a null `user_id` (synthetic) has no login path
- [ ] No training table carries a name or email column
- [ ] The seed script links Mads's athlete row to a seeded user
- [ ] Tests cover the user → athlete resolution, the signed-out case, and that a repeated signup leaves exactly one linked athlete row

## Blocked by

`.scratch/eval-mvp-build/issues/01-walking-skeleton.md`
