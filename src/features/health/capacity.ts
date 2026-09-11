/**
 * What an Injury or an Illness prevents — the only half of a health record a
 * Coach prompt ever sees ([ADR 0011](../../../docs/adr/0011-an-injury-is-split-by-who-reads-it.md)).
 *
 * **Two concepts, not one with a severity dial.** An Injury is usually
 * discipline-specific and gets worked around: a running injury does not stop
 * swimming, which for a triathlete reshapes a week rather than emptying it. An
 * Illness is systemic and removes every discipline together.
 *
 * **Capacity, never diagnosis.** The Coach's remit is prevention, load
 * management, training modification and graded-return *principles*; diagnosis,
 * treatment, rehabilitation protocols and imaging are OUT (the posture ruling in
 * `.scratch/knowledge-oracle/corpus.md`). So this module speaks in allowances
 * per discipline and has no vocabulary for anything else.
 *
 * **The detail thread is not an input here, and that is structural.** It is not
 * a field this module can read, so there is no path by which a physio's note
 * reaches a prompt — a stronger guarantee than remembering to strip it at the
 * seam. `narration.ts` refuses the same thing for a Head Coach's session note,
 * and for the same reason: a sentence that lands in the transcript is replayed
 * to the model on every later turn.
 *
 * Pure: records in, a sentence out. No database, no clock, no network.
 */

/** The three disciplines a triathlete's week is made of. */
export const DISCIPLINES = ['swim', 'bike', 'run'] as const;

export type Discipline = (typeof DISCIPLINES)[number];

/**
 * How much of a discipline is available.
 *
 * Three values, because that is what the athlete can say honestly about
 * themselves without a clinician: none of it, some of it, all of it. "Can't
 * run" is `none`; "can ride easy, not hard" is `easy`. There is deliberately no
 * numeric scale — a percentage would invite the Coach to do arithmetic on a
 * judgement the athlete made by feel.
 */
export const ALLOWANCES = ['none', 'easy', 'full'] as const;

export type Allowance = (typeof ALLOWANCES)[number];

/** What an athlete says an Injury prevents, per discipline. */
export type Capacity = Record<Discipline, Allowance>;

/** Everything unrestricted — the shape an athlete with nothing wrong has. */
export const FULL_CAPACITY: Capacity = { swim: 'full', bike: 'full', run: 'full' };

/** An open Injury, as this module reads it. Never its detail thread. */
export interface OpenInjury {
  capacity: Capacity;
}

/**
 * The athlete's capacity across every open Injury and Illness.
 *
 * **Illness wins, and wins completely.** It is systemic — it removes every
 * discipline together — so an open Illness is `none` everywhere regardless of
 * what any Injury says. Two athletes, one with a calf strain and one with a calf
 * strain *and* flu, must not be planned the same way.
 *
 * Otherwise the **most restrictive** open Injury decides each discipline
 * independently. Two injuries do not average out: an athlete who cannot run and
 * can ride easy has both of those facts true at once, and taking the gentler of
 * the two would plan training they have said they cannot do.
 */
export function combinedCapacity(
  injuries: OpenInjury[],
  hasOpenIllness: boolean,
): Capacity {
  if (hasOpenIllness) return { swim: 'none', bike: 'none', run: 'none' };

  return {
    swim: mostRestrictive(injuries, 'swim'),
    bike: mostRestrictive(injuries, 'bike'),
    run: mostRestrictive(injuries, 'run'),
  };
}

/**
 * The tightest allowance any open Injury places on one discipline.
 *
 * `ALLOWANCES` is ordered from most to least restrictive, so the lowest index
 * wins and no injuries at all leaves `full`. Written as a minimum over indices
 * rather than a pairwise comparison: a `<` between two allowances is a
 * comparison that gives the same answer whichever way it is written when they
 * are equal, which is a branch no test can distinguish and no reader should
 * have to think about.
 */
function mostRestrictive(injuries: OpenInjury[], discipline: Discipline): Allowance {
  const tightest = injuries.reduce(
    (lowest, injury) => Math.min(lowest, ALLOWANCES.indexOf(injury.capacity[discipline])),
    ALLOWANCES.indexOf('full'),
  );
  return ALLOWANCES[tightest];
}

/**
 * The capacity as the Coach reads it, or null when nothing is restricted.
 *
 * Null rather than "everything is fine": a block saying nothing is wrong, on
 * every prompt for every healthy athlete, is noise the model learns to skip —
 * and this block needs to be read on the week it appears.
 *
 * The sentence names **only what the athlete said**. There is no body location
 * in it, because there is no body location in the input: "left knee" does not
 * imply running is out, and making that leap is a clinical inference sitting on
 * the OUT side of the posture ruling.
 */
export function capacityStatement(
  injuries: OpenInjury[],
  hasOpenIllness: boolean,
): string | null {
  const capacity = combinedCapacity(injuries, hasOpenIllness);
  const restricted = DISCIPLINES.filter((d) => capacity[d] !== 'full');
  if (restricted.length === 0) return null;

  const clauses = restricted.map((d) =>
    capacity[d] === 'none' ? `no ${d}` : `${d} easy only`,
  );

  const cause = hasOpenIllness
    ? 'The athlete is ill and is training none of it.'
    : 'The athlete has reported an injury.';

  // "Substitute rather than cancel" is the whole point of per-discipline
  // capacity — but only while there is a discipline left to substitute with. An
  // Illness leaves none, and telling the Coach to swap a run for a swim the
  // athlete has also been told they cannot do is an instruction it can only
  // fail. What it plans while they are ill is rest; the calendar is still not
  // its to edit.
  const planning = hasOpenIllness
    ? 'Plan rest until they say they are recovered'
    : 'Plan around it: substitute rather than cancel';

  return (
    `CAPACITY: ${cause} ${clauses.join('; ')}. ` +
    'This is what they said they can do, not a diagnosis — you have not been told ' +
    `what is wrong or where, and must not ask them to work it out. ${planning}, ` +
    'and do not skip or move sessions on your own.'
  );
}
