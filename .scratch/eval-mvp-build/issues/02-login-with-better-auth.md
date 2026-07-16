Status: ready-for-agent
Label: wayfinder:task

# 02 — Logging in reaches your own athlete row

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

Authentication via better-auth, wired so that a logged-in person resolves to *their* athlete row and sees their own `display_name` on a protected page. Signed out, that page is unreachable.

This is where the identity-separation rule from [ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md) becomes structural: better-auth owns `user`, `session`, `account`, `verification`; the `athlete` row points at a user via `user_id`; and **no training table ever carries an email or a name**. All training data keys off the opaque athlete ID. Get this seam right here and every later slice inherits it.

Roles are rows you *have*, not things you *are* (ticket 05, ballot 1) — holding an athlete row makes you an athlete. Synthetic athletes keep `user_id` null and cannot log in; that is the mechanism, not an edge case.

The seed script grows: Mads's athlete row now links to a real user.

## Acceptance criteria

- [ ] better-auth is wired with the Drizzle adapter; its tables exist via migration
- [ ] A person can sign up, sign in, and sign out
- [ ] The session survives a page refresh
- [ ] A protected page renders the signed-in person's own athlete `display_name`, resolved from user → athlete
- [ ] Signed out, that page redirects to sign-in rather than rendering or erroring
- [ ] An athlete row with a null `user_id` (synthetic) has no login path
- [ ] No training table carries a name or email column
- [ ] The seed script links Mads's athlete row to a seeded user
- [ ] Tests cover the user → athlete resolution, including the signed-out case

## Blocked by

`.scratch/eval-mvp-build/issues/01-walking-skeleton.md`
