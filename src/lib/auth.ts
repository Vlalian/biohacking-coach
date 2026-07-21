import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
// Relative imports, not the @/ alias: this module is loaded by the seed (tsx)
// and the better-auth CLI as well as Next, and relative paths resolve in all of
// them without alias configuration.
import { getDb } from '../db';
import { provisionAthlete } from '../features/athlete/athlete-provisioning';

/**
 * The authentication seam (ADR 0006, slice 02).
 *
 * better-auth owns login identity — the `user`, `session`, `account`, and
 * `verification` tables. A real athlete's name lives on `user.name` and is
 * reached only by joining through `athlete.user_id`; no training table carries
 * a name or an email. That is what makes ADR 0006's identity separation
 * structural rather than a promise in a comment.
 *
 * `getDb()` is called here at module load, but the neon-http driver opens no
 * connection until a query runs — so importing this module costs the
 * `DATABASE_URL` env var, not a live database (the same lazy contract the db
 * module documents).
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: 'pg' }),

  // Registration is enabled everywhere in this slice. Turning it OFF on the
  // hosted deployment (while it stays on locally and in tests) is slice 16's
  // job, not this one — see .scratch/eval-mvp-build/issues/16-tier-1-hardening.md.
  emailAndPassword: {
    enabled: true,
  },

  databaseHooks: {
    user: {
      create: {
        // Signing up creates the athlete row (Mads, 2026-07-17): a new user gets
        // exactly one athlete row that points back at them. The provisioning
        // seam owns the write and its idempotency; the hook just names when.
        after: async (user) => {
          await provisionAthlete(user.id);
        },
      },
    },
  },

  plugins: [nextCookies()],
});

/** The signed-in session shape, inferred from the config above. */
export type Session = typeof auth.$Infer.Session;
