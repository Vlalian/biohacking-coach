import { PERSONA_LABELS } from './synthetic-history';

/**
 * What `scripts/retire-personas.ts` decides, without the database it acts on
 * (code-health/13).
 *
 * The seed stopped creating the synthetic personas on 2026-09-18; this is how
 * the rows it already wrote leave every database they reached. Pure for the
 * same reason `synthetic-history.ts` is: the script needs credentials and a
 * live Postgres, so anything decided inside it is unverifiable, and "does it
 * ever delete a real person" is a question that must have a test.
 */

/**
 * The shallow persona the seed carried before the generated ones — a single
 * `synthetic_label` row with no history, once route 06's proof that the
 * identity constraint held. Retired with the others: it names nobody real,
 * but it is still a fabricated athlete in a database about to hold real ones.
 */
export const TEST_ATHLETE_LABEL = 'Test Athlete';

/**
 * Every label the seed ever fabricated. Labels, not ids: since code-health/18
 * each tester Head Coach holds their own copy of the personas at ids derived
 * from the coach, so the ids are open and the names are the closed list.
 * `athlete_identity_source` makes a labelled row userless by rule.
 */
export const RETIRED_PERSONA_LABELS: readonly string[] = [...PERSONA_LABELS, TEST_ATHLETE_LABEL];

/** A persona row as the script finds it, with what would cascade from it. */
export interface PersonaRow {
  id: string;
  syntheticLabel: string | null;
  userId: string | null;
  sessions: number;
  links: number;
}

export interface RetirementPlan {
  erase: PersonaRow[];
  /** Rows under a persona label that belong to a real person. Never erased. */
  refused: PersonaRow[];
}

export type RetireArgs = { yes: boolean } | { error: string };

/** `--yes` makes it real; anything else is a mistake, not a flag to ignore. */
export function parseRetireArgs(argv: readonly string[]): RetireArgs {
  // `--production` is the guard's flag, read by `guardDatabase`, not here.
  const unknown = argv.find((a) => a !== '--yes' && a !== '--production');
  if (unknown !== undefined) return { error: `unknown argument: ${unknown}` };
  return { yes: argv.includes('--yes') };
}

/**
 * A persona has no user — `athlete_identity_source` makes that a database
 * rule. A row under one of these labels that *does* carry a user is therefore
 * a real athlete, and one such row refuses the whole run: this script deletes
 * nobody real, and a partial erasure would hide that it nearly did.
 */
export function planRetirement(found: readonly PersonaRow[]): RetirementPlan {
  const refused = found.filter((r) => r.userId !== null);
  return {
    erase: refused.length === 0 ? [...found] : [],
    refused,
  };
}

/** One line per label found, so "how many coaches hold a copy" is readable at a glance. */
function copiesPerLabel(rows: readonly PersonaRow[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.syntheticLabel ?? '?', (counts.get(r.syntheticLabel ?? '?') ?? 0) + 1);
  return [...counts].map(([label, n]) => `${label}: ${n} ${n === 1 ? 'copy' : 'copies'}`);
}

/** The run, one line per row, then per label, ending with what happens next. */
export function describeRetirement(plan: RetirementPlan, yes: boolean): string[] {
  const lines = [
    ...plan.refused.map((r) => `REFUSE ${r.id} — has a user (${r.userId}); not a persona`),
    ...plan.erase.map(
      (r) =>
        `erase  ${r.syntheticLabel} (${r.id}): ${r.sessions} session(s), ${r.links} Coaching Link(s)`,
    ),
    ...copiesPerLabel(plan.erase),
  ];
  if (plan.refused.length > 0) {
    lines.push('refused at least one row; nothing erased.');
  } else if (yes) {
    lines.push(
      `erasing ${plan.erase.length} athlete row(s) and everything that cascades from them.`,
    );
  } else {
    lines.push(`dry run: ${plan.erase.length} athlete row(s) would be erased. Re-run with --yes.`);
  }
  return lines;
}
