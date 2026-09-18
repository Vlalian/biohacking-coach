/**
 * What `scripts/seed.ts` decides about the personas, without the database it
 * writes them to (code-health/16).
 *
 * The three generated athletes (`synthetic-history.ts`) are for the Head Coach
 * tester round: on for `seed-template` and production before the round, off
 * everywhere else. Off is the default and the default is load-bearing — the
 * page suite's baselines (`test/e2e`) and the dry dev seed start from a Roster
 * of one, and a flag that leaked into the flag-less path would move every
 * picture. Pure for the reason `retire-personas.ts` is: the seed needs
 * credentials and a live Postgres, so a decision made inside it has no test.
 */

export type SeedArgs = { withPersonas: boolean } | { error: string };

/** The seed's own flag. `--production` is the database guard's (PR #83) and passes through. */
const KNOWN = ['--with-personas', '--production'] as const;

/** `--with-personas` writes the three personas; anything unknown is a mistake, not a flag to ignore. */
export function parseSeedArgs(argv: readonly string[]): SeedArgs {
  const unknown = argv.find((a) => !(KNOWN as readonly string[]).includes(a));
  if (unknown !== undefined) return { error: `unknown argument: ${unknown}` };
  return { withPersonas: argv.includes('--with-personas') };
}
