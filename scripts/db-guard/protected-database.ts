/**
 * The production branch's Neon endpoint id. Not a secret — it is the host part
 * of the connection string, visible in every log line — but it is the one
 * host no script may write to without saying so. Found necessary 2026-09-18:
 * `.env.local` had carried the production string for weeks, and every
 * `npm run seed` and page-suite run had been writing to it.
 */
export const PRODUCTION_ENDPOINT = 'ep-summer-paper-as6vrca1';

export interface Verdict {
  ok: boolean;
  reason?: string;
}

/**
 * Decides whether a writing script may proceed against `databaseUrl`.
 * Pure: the scripts call this with `process.env.DATABASE_URL` and `process.argv`.
 */
export function protectedDatabaseVerdict(
  databaseUrl: string | undefined,
  argv: readonly string[],
): Verdict {
  if (!databaseUrl) {
    return { ok: false, reason: 'DATABASE_URL is not set; nothing to run against.' };
  }
  const isProduction = databaseUrl.includes(PRODUCTION_ENDPOINT);
  if (isProduction && !argv.includes('--production')) {
    return {
      ok: false,
      reason:
        `DATABASE_URL points at the production endpoint (${PRODUCTION_ENDPOINT}). ` +
        'Refusing to write. If this is intended, pass --production; otherwise point ' +
        '.env.local at a dev branch (`neon connection-string dev/<name>`).',
    };
  }
  return { ok: true };
}

/** Exits the process with the reason when the verdict refuses. For scripts' first line. */
export function guardDatabase(databaseUrl: string | undefined, argv: readonly string[]): void {
  const verdict = protectedDatabaseVerdict(databaseUrl, argv);
  if (!verdict.ok) {
    console.error(verdict.reason);
    process.exit(1);
  }
}
