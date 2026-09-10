import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq, isNull } from 'drizzle-orm';
import { healthNotes, illnesses, injuries } from '@/db/schema';

const rows: unknown[] = [];

const orderBy = vi.fn(() => Promise.resolve(rows));
const selectWhere = vi.fn(() => ({ orderBy }));

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
    select: () => ({ from: () => ({ where: selectWhere }) }),
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
} = await import('./health-repository');

const CANNOT_RUN = { swim: 'full', bike: 'full', run: 'none' } as const;

beforeEach(() => {
  rows.length = 0;
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
    await addHealthNote({ injuryId: 'injury_1' }, 'athlete', 'sore on push-off');

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
    await addHealthNote({ injuryId: 'injury_1' }, 'head_coach', 'physio Thursday');

    expect(inserted[0]).toMatchObject({ authorRole: 'head_coach' });
  });

  it('attaches a note to an Illness as readily as an Injury', async () => {
    await addHealthNote({ illnessId: 'illness_1' }, 'athlete', 'fever gone');

    expect(inserted[0]).toMatchObject({ illnessId: 'illness_1' });
  });

  it('reads a thread back by its subject', async () => {
    await getHealthNotes({ injuryId: 'injury_1' });
    expect(selectWhere).toHaveBeenCalledWith(eq(healthNotes.injuryId, 'injury_1'));

    vi.clearAllMocks();
    await getHealthNotes({ illnessId: 'illness_1' });
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
