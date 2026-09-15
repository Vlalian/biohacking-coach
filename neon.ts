import { defineConfig } from '@neon/config/v1';

/**
 * Neon branch policy as code (GDPR decision 8, ADR 0005 amendment 2026-09-11).
 *
 * The rule: `production` holds real athlete data and is reached only by Vercel's
 * production environment; every other branch is a copy-on-write child of
 * `seed-template` — schema-only, seeded once — and dies on its own.
 *
 * What this file enforces, and where it does not reach:
 *
 * - `neon checkout <name>` evaluates `branch` BEFORE creating a branch
 *   (`exists === false`), so a branch made that way is born with the right
 *   parent, a TTL, and a cheap compute. That is the safety net for a branch
 *   made by hand, which is the case nothing else covered.
 * - `neon deploy` reconciles the linked branch. It WOULD be how `production`
 *   gets `protected: true` (no delete, no reset) — but the Free plan allows
 *   zero protected branches (HTTP 422 on 2026-09-12), so that line is not
 *   here. Add `protected: true` to the production case on the day the plan
 *   changes; until then, "never delete production" is a rule, not a lock.
 * - It does NOT reach `neon branches create` (which `New-Session.ps1` uses —
 *   that script sets parent and expiry itself) nor the Vercel integration's
 *   `preview/*` branches (their parent is the project's default branch, which is
 *   `seed-template`, and the integration deletes them with the git branch).
 *
 * Not declared on purpose: `auth` and `dataApi`. A `neon_auth` schema exists in
 * the database from an earlier console click, but nothing uses it — better-auth
 * is self-hosted (research §2). Declaring `auth: true` here would make
 * `neon env pull` write NEON_AUTH_* vars into .env.local that the app ignores.
 */
export default defineConfig({
  branch: (branch) => {
    // The real data. Never expires. Left untouched — see the header for why
    // `protected: true` is not here yet.
    if (branch.name === 'production') {
      return {};
    }

    // The seeded schema-only root that everything else is cut from. Leave it
    // exactly as it is: no TTL (it must outlive every child), default compute.
    if (branch.name === 'seed-template') {
      return {};
    }

    // An existing branch is not reshaped underneath whoever is using it.
    if (branch.exists) {
      return {};
    }

    // Everything else: a dev, test, or throwaway branch. Cut from the seeded
    // template, gone in two weeks, and as cheap as Neon allows — the Free plan
    // has 100 compute-hours a month and ten branch slots. No `suspendTimeout`:
    // the Free plan rejects it (HTTP 412, "modifying the suspend interval is
    // not permitted on this account") and fixes it at five minutes anyway.
    return {
      parent: 'seed-template',
      ttl: '14d',
      postgres: {
        computeSettings: {
          autoscalingLimitMinCu: 0.25,
          autoscalingLimitMaxCu: 1,
        },
      },
    };
  },
});
