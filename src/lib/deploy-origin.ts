/**
 * Where this deployment answers — read by auth (`auth.ts`) and by anything that
 * must call the app's own routes, like the Garmin import's chained run
 * (`garmin-integration/08`). Moved out of `auth.ts` so a caller does not load
 * better-auth to learn its own origin.
 */

/**
 * The deployment variables the origin rules read. Exactly these five — no
 * index signature, so a misspelt key in a test is a type error, not a silent
 * `undefined`. {@link deployEnv} picks them out of `process.env`.
 */
export type DeployEnv = {
  BETTER_AUTH_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

export function deployEnv(): DeployEnv {
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
