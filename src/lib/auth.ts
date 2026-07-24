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

/**
 * The base URL better-auth signs cookies and builds callbacks against.
 *
 * Derived, not hardcoded (slice 03): locally it is `BETTER_AUTH_URL` from
 * `.env.local`; on Vercel it is the deployment's own origin — the stable
 * production URL in production, the unique per-deployment URL in a preview, so
 * auth works on branch previews too. Returns undefined when nothing is set, and
 * better-auth infers the origin from the request — the point is it is never an
 * *invalid* string, which is what crashed the first deploy.
 */
function resolveBaseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  // VERCEL_PROJECT_PRODUCTION_URL holds the *production* origin on every
  // deployment, previews included — so a preview must use its own VERCEL_URL,
  // or auth would sign against production and break on the branch URL. Switch on
  // VERCEL_ENV to pick the right one.
  const vercelHost =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : undefined;
}

const baseURL = resolveBaseURL();

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: 'pg' }),

  // Explicit so it is never inferred wrong behind Vercel's proxy; undefined
  // locally is fine (better-auth reads the request origin).
  baseURL,
  trustedOrigins: baseURL ? [baseURL] : [],

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
