import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq, isNull } from 'drizzle-orm';
import { healthNotes, illnesses, injuries } from '@/db/schema';

const rows: unknown[] = [];

// The two open-record reads are the same chain against different tables, so the
// mock has to know which one it is answering. Without this, an open Injury also
// comes back as an open Illness and `capacityFor` can never be shown deciding
// between them.
const illnessRows: unknown[] = [];
let lastTable: unknown = null;

// What the last `select()` asked for. The ownership probe reads one column and
// the listing reads the row; keeping the projection visible is what lets the
// difference be asserted rather than assumed.
let lastProjection: unknown = null;

// The mocked select answers two different shapes now: `.where(...).orderBy(...)`
// for the listing queries, and a bare awaited `.where(...)` for the ownership
// probe. `owned` is what that probe sees.
let owned: unknown[] = [{ id: 'injury_1' }];

const orderBy = vi.fn(() => Promise.resolve(lastTable === illnesses ? illnessRows : rows));
const selectWhere = vi.fn(() => {
  const probe = Promise.resolve(owned) as Promise<unknown[]> & { orderBy: typeof orderBy };
  probe.orderBy = orderBy;
  return probe;
});

const inserted: unknown[] = [];
const insertValues = vi.fn((v: unknown) => {
  inserted.push(v);
  return Promise.resolve();
});

const updates: { set: unknown; where: unknown }[] = [];
const updateWhere = vi.fn((w: unknown) => {
  updates[updates.length - 1].where = w;
  return Promise.resolve();
});
const set = vi.fn((v: unknown) => {
  updates.push({ set: v, where: null });
  return { where: updateWhere };
});

vi.mock('@/db', () => ({
  getDb: () => ({
    select: (projection?: unknown) => ({
      from: (table: unknown) => {
        lastProjection = projection;
        lastTable = table;
        return { where: selectWhere };
      },
    }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set }),
  }),
}));

const {
  addHealthNote,
  closeIllness,
  closeInjury,
  declareIllness,
  declareInjury,
  getHealthNotes,
  getOpenIllnesses,
  getOpenInjuries,
  capacityFor,
} = await import('./health-repository');

const CANNOT_RUN = { swim: 'full', bike: 'full', run: 'none' } as const;

beforeEach(() => {
  owned = [{ id: 'injury_1' }];
  rows.length = 0;
  illnessRows.length = 0;
  lastTable = null;
  lastProjection = null;
  inserted.length = 0;
  updates.length = 0;
  vi.clearAllMocks();
});

describe('declaring, and closing', () => {
  it('opens an Injury with what the athlete says it prevents', async () => {
    await declareInjury('athlete_1', CANNOT_RUN);

    expect(inserted[0]).toEqual({ athleteId: 'athlete_1', swim: 'full', bike: 'full', run: 'none' });
  });

  it('opens an Illness with no capacity at all', async () => {
    // It removes every discipline, so there is nothing per-discipline to say.
    // A capacity here would be a severity dial, which is what ADR 0011's two
    // concepts exist to avoid.
    await declareIllness('athlete_1');

    expect(inserted[0]).toEqual({ athleteId: 'athlete_1' });
  });

  it('takes no end date when opening either — there is no field for one', async () => {
    await declareInjury('athlete_1', CANNOT_RUN);
    await declareIllness('athlete_1');

    for (const row of inserted as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty('closedAt');
      expect(row).not.toHaveProperty('expectedEnd');
    }
  });

  it('closes an Injury by stamping when the athlete said it was over', async () => {
    await closeInjury('athlete_1', 'injury_1');

    expect(updates).toHaveLength(1);
    expect((updates[0].set as { closedAt: Date }).closedAt).toBeInstanceOf(Date);
  });

  it('closes an Illness the same way', async () => {
    // Stamped, not deleted: a recovered illness is a thing that happened, and
    // slice 10's Recovery Period will want to know it did.
    await closeIllness('athlete_1', 'illness_1');

    expect(updates).toHaveLength(1);
    expect((updates[0].set as { closedAt: Date }).closedAt).toBeInstanceOf(Date);
  });

  it('scopes closing to the athlete, so a forged id cannot close another', async () => {
    // ADR 0006: every training read and write keys off the opaque athlete id.
    // An id alone is a guessable handle on somebody else's record.
    await closeInjury('athlete_1', 'injury_1');
    expect(updates[0].where).toEqual(
      and(eq(injuries.athleteId, 'athlete_1'), eq(injuries.id, 'injury_1')),
    );

    updates.length = 0;
    await closeIllness('athlete_1', 'illness_1');
    expect(updates[0].where).toEqual(
      and(eq(illnesses.athleteId, 'athlete_1'), eq(illnesses.id, 'illness_1')),
    );
  });
});

describe('open means "has not been closed"', () => {
  it('asks for the athlete records with no end stamped', async () => {
    // Not a status column: an injury has no scheduled end to compare against,
    // so there is nothing to check but the null.
    await getOpenInjuries('athlete_1');

    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(injuries.athleteId, 'athlete_1'), isNull(injuries.closedAt)),
    );
  });

  it('does the same for Illnesses', async () => {
    await getOpenIllnesses('athlete_1');

    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(illnesses.athleteId, 'athlete_1'), isNull(illnesses.closedAt)),
    );
  });
});

describe('the detail thread — for human eyes only', () => {
  it('takes a note from the athlete', async () => {
    await addHealthNote('athlete_1', { injuryId: 'injury_1' }, 'athlete', 'sore on push-off');

    expect(inserted[0]).toEqual({
      injuryId: 'injury_1',
      authorRole: 'athlete',
      body: 'sore on push-off',
    });
  });

  it('takes a note from the Head Coach on the same thread', async () => {
    // Both authors, one thread. That is the whole point — and precisely why it
    // must never reach the model: a Head Coach's clinical note replayed on every
    // later turn is the hazard `narration.ts` already refuses.
    await addHealthNote('athlete_1', { injuryId: 'injury_1' }, 'head_coach', 'physio Thursday');

    expect(inserted[0]).toMatchObject({ authorRole: 'head_coach' });
  });

  it('attaches a note to an Illness as readily as an Injury', async () => {
    await addHealthNote('athlete_1', { illnessId: 'illness_1' }, 'athlete', 'fever gone');

    expect(inserted[0]).toMatchObject({ illnessId: 'illness_1' });
  });

  it('reads a thread back by its subject', async () => {
    await getHealthNotes('athlete_1', { injuryId: 'injury_1' });
    expect(selectWhere).toHaveBeenCalledWith(eq(healthNotes.injuryId, 'injury_1'));

    vi.clearAllMocks();
    await getHealthNotes('athlete_1', { illnessId: 'illness_1' });
    expect(selectWhere).toHaveBeenCalledWith(eq(healthNotes.illnessId, 'illness_1'));
  });
});


describe('declaring or closing never touches the plan', () => {
  it('writes to no table but its own', async () => {
    // The acceptance criterion: "leaves every session's status, placement and
    // parked flag untouched". Kept structurally rather than by remembering —
    // this module does not import `sessions` at all, so there is no statement
    // it could issue against one.
    //
    // The consequence is the point: nothing is destroyed when an injury is
    // declared, so nothing has to be restored when the athlete recovers, and
    // the unattempted sessions resolve the ordinary way at the next Weekly
    // Session (US-3) — no alarm, no demand for an explanation.
    const source = readFileSync(
      fileURLToPath(new URL('./health-repository.ts', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ');

    for (const forbidden of ['sessions', 'unavailableDates', 'parked', 'status']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('issues one statement per declaration, and it is an insert', async () => {
    // A declaration is an insert and nothing else. If this ever grows a second
    // write, that write is the one to look at.
    await declareInjury('athlete_1', CANNOT_RUN);

    expect(inserted).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it('issues one statement per closing, and it is an update to that record', async () => {
    await closeInjury('athlete_1', 'injury_1');

    expect(updates).toHaveLength(1);
    expect(inserted).toHaveLength(0);
    expect(Object.keys(updates[0].set as object)).toEqual(['closedAt']);
  });
});


describe('the detail thread is not reachable by id alone', () => {
  // GDPR Article 9 free text - body location, what a physio said. Keying it on
  // the record id would make it readable and writable by anyone holding one.
  // ADR 0006: training data keys off the opaque athlete id, and this is the
  // last data in the app that should get an exception.

  it('refuses a note on a record the athlete does not own', async () => {
    owned = [];

    await expect(
      addHealthNote('athlete_2', { injuryId: 'injury_1' }, 'athlete', 'prying'),
    ).rejects.toThrow(/does not own/i);
    expect(inserted).toHaveLength(0);
  });

  it('refuses on behalf of a Head Coach just the same', async () => {
    owned = [];

    await expect(
      addHealthNote('athlete_2', { illnessId: 'illness_1' }, 'head_coach', 'prying'),
    ).rejects.toThrow(/does not own/i);
    expect(inserted).toHaveLength(0);
  });

  it('reads back nothing for a record that is not theirs', async () => {
    // Empty rather than an error, and deliberately the same answer as a record
    // with no notes: a caller that could tell those apart could enumerate other
    // people's injuries by id.
    owned = [];
    rows.push({ id: 'note_1' });

    expect(await getHealthNotes('athlete_2', { injuryId: 'injury_1' })).toEqual([]);
  });

  it('checks ownership against the record, not against the note', async () => {
    owned = [];
    await getHealthNotes('athlete_2', { injuryId: 'injury_1' });

    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(injuries.id, 'injury_1'), eq(injuries.athleteId, 'athlete_2')),
    );
  });

  it('checks an Illness against its own table, not the Injury one', async () => {
    // The two arms of the probe are a real fork: an Illness id checked against
    // `injuries` would match nothing and refuse every note on every illness.
    owned = [];
    await getHealthNotes('athlete_2', { illnessId: 'illness_1' });

    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(illnesses.id, 'illness_1'), eq(illnesses.athleteId, 'athlete_2')),
    );
  });

  it('asks the probe for the id alone, never for the record', async () => {
    // An ownership question needs one column. Selecting the row would pull
    // Article 9 columns into memory to answer "is this yours?", which is the
    // opposite of what this guard exists for.
    owned = [];
    await getHealthNotes('athlete_2', { injuryId: 'injury_1' });

    expect(lastProjection).toEqual({ id: injuries.id });

    vi.clearAllMocks();
    await getHealthNotes('athlete_2', { illnessId: 'illness_1' });

    expect(lastProjection).toEqual({ id: illnesses.id });
  });

  it('says in the refusal why the thread is not reachable by id', async () => {
    // The message is the only place a future reader meets the reason at the
    // moment they hit the guard. Asserted whole, so it cannot be hollowed out.
    owned = [];

    await expect(
      addHealthNote('athlete_2', { injuryId: 'injury_1' }, 'athlete', 'prying'),
    ).rejects.toThrow(/Article 9 data and is never reachable by id alone \(ADR 0006\)/);
  });
});

describe('capacityFor — the one read both Coach surfaces share', () => {
  // Extracted by the 2026-09-10 review. The Weekly Session and the Coach
  // Briefing were each spelling out the same two reads, the same `.map` into
  // `{ capacity }`, the same cast and the same `length > 0`. Duplicated, that
  // shape drifts: the day an Injury grows a fourth discipline, one copy gets it.
  it('renders what the open Injuries prevent', async () => {
    rows.push({ swim: 'full', bike: 'easy', run: 'none' });

    const statement = await capacityFor('athlete_1');

    expect(statement).toContain('bike easy only; no run');
    expect(statement).toContain('not a diagnosis');
  });

  it('lets an open Illness remove every discipline, whatever the Injuries say', async () => {
    // The join is the point: neither read alone can tell the Coach this. An
    // athlete with a calf strain *and* flu must not be planned like one with
    // only the strain.
    rows.push({ swim: 'full', bike: 'easy', run: 'none' });
    illnessRows.push({ id: 'illness_1' });

    const statement = await capacityFor('athlete_1');

    expect(statement).toContain('no swim; no bike; no run');
    expect(statement).toContain('ill');
  });

  it('is null when nothing is restricted', async () => {
    // Absent, not "nothing is wrong". A block on every prompt for every healthy
    // athlete is noise the model learns to skip.
    expect(await capacityFor('athlete_1')).toBeNull();
  });

  it('reads both records, each scoped to the athlete and to what is still open', async () => {
    await capacityFor('athlete_1');

    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(injuries.athleteId, 'athlete_1'), isNull(injuries.closedAt)),
    );
    expect(selectWhere).toHaveBeenCalledWith(
      and(eq(illnesses.athleteId, 'athlete_1'), isNull(illnesses.closedAt)),
    );
  });

  it('carries the athlete-stated capacity across, and nothing else from the row', async () => {
    // An Injury row has more on it than three allowances. Only the three cross
    // into the sentence — ADR 0011's split is kept here by what is copied, not
    // by what the renderer happens to ignore.
    rows.push({
      id: 'injury_1',
      athleteId: 'athlete_1',
      swim: 'full',
      bike: 'full',
      run: 'none',
      openedAt: new Date('2026-09-01'),
    });

    const statement = await capacityFor('athlete_1');

    expect(statement).toContain('no run');
    expect(statement).not.toContain('injury_1');
    expect(statement).not.toContain('2026-09-01');
  });
});
