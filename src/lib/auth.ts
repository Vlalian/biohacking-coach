import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins';
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
 * The deployment variables the origin rules read. Exactly these five — no
 * index signature, so a misspelt key in a test is a type error, not a silent
 * `undefined`. {@link deployEnv} picks them out of `process.env`.
 */
type DeployEnv = {
  BETTER_AUTH_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

function deployEnv(): DeployEnv {
  const { BETTER_AUTH_URL, VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL } =
    process.env;
  return { BETTER_AUTH_URL, VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL };
}

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
export function resolveBaseURL(env: DeployEnv): string | undefined {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  // VERCEL_PROJECT_PRODUCTION_URL holds the *production* origin on every
  // deployment, previews included — so a preview must use its own VERCEL_URL,
  // or auth would sign against production and break on the branch URL. Switch on
  // VERCEL_ENV to pick the right one.
  const vercelHost =
    env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : undefined;
}

/**
 * The origins a sign-in may come from: the base URL, plus — on a preview — the
 * deployment's git-branch alias.
 *
 * Vercel serves one preview on two hosts. `VERCEL_URL` is the unique
 * per-deployment host and is what {@link resolveBaseURL} uses; the PR comment
 * and the dashboard link the *branch alias* (`VERCEL_BRANCH_URL`,
 * `<project>-git-<branch>-<team>.vercel.app`). Only the first was trusted, so
 * every sign-in from a linked preview failed with "Invalid origin" while the
 * same deployment on its unique host worked (found testing PR #77). Both hosts
 * are the same build, so both are trusted. Production and local keep their one
 * origin.
 */
export function resolveTrustedOrigins(env: DeployEnv): string[] {
  const base = resolveBaseURL(env);
  if (!base) return [];
  // `preview` exactly: `vercel dev` (`development`) and a local `.env.local`
  // that pulled a `VERCEL_BRANCH_URL` must not widen the trusted set.
  const branchAlias =
    env.VERCEL_ENV === 'preview' && env.VERCEL_BRANCH_URL
      ? `https://${env.VERCEL_BRANCH_URL}`
      : undefined;
  return branchAlias && branchAlias !== base ? [base, branchAlias] : [base];
}

const baseURL = resolveBaseURL(deployEnv());

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: 'pg' }),

  // Explicit so it is never inferred wrong behind Vercel's proxy; undefined
  // locally is fine (better-auth reads the request origin).
  baseURL,
  trustedOrigins: resolveTrustedOrigins(deployEnv()),

  // Email/password login is always on. Self-*registration* is switched off on
  // the deployment and left on locally and in tests (slice 16, route 10 ballot
  // 1): the deployment holds health data and has no one in the eval who needs
  // to self-register — both humans are seeded (Mads by slice 02, the coach by
  // slice 11), and slice 03 asks Mads to sign *in*.
  //
  // Driven by `DISABLE_SIGNUP`: set it to "true" on Vercel, leave it unset
  // locally so slice 02's "a person can sign up" still passes on the dev box and
  // in tests. The seed is then the ONLY way an account can exist on the
  // deployment, which is exactly why the seed creates users through
  // better-auth's own server API (`signUpEmail`), not raw `user` inserts —
  // otherwise nobody could log in, with no self-registration to escape through.
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.DISABLE_SIGNUP === 'true',
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

  // The operator's tools (2026-09-11): list users, set a role, ban, and above
  // all *impersonate* — open the app as the coach for an hour to see what they
  // see, without knowing their password. That is a health-data access path, so
  // it is logged by the plugin (`session.impersonated_by`) and must be named in
  // the consent artifact as "the operator can view the app as you for support"
  // before anyone but Mads holds an account it could reach.
  //
  // Who is an admin: the `user.role` column, which the seed sets to 'admin' on
  // Mads and on nobody else. No `adminUserIds` — ids differ per database branch,
  // and a role column travels with the seed to every branch. The eval has one
  // operator, so one admin. nextCookies() stays last, as better-auth's Next.js
  // guide requires.
  plugins: [admin({ adminRoles: ['admin'] }), nextCookies()],
});

/** The signed-in session shape, inferred from the config above. */
export type Session = typeof auth.$Infer.Session;
