import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `training-architecture/06` — the athlete's own statements about their body.
 *
 * Declaring, closing, rating and noting all go through here. Validation is at
 * this boundary: the closed sets (`ALLOWANCES`, 1–5) are refused before a
 * feature module is reached, and every write resolves the athlete from the
 * session — an id never arrives from the client.
 */
const {
  resolveAthleteId,
  declareInjury,
  declareIllness,
  closeInjury,
  closeIllness,
  addHealthNote,
  setBother,
  getHealthNotes,
  revalidatePath,
} = vi.hoisted(() => ({
  resolveAthleteId: vi.fn<() => Promise<string | null>>(async () => 'athlete_1'),
  declareInjury: vi.fn(async () => {}),
  declareIllness: vi.fn(async () => {}),
  closeInjury: vi.fn(async () => {}),
  closeIllness: vi.fn(async () => {}),
  addHealthNote: vi.fn(async () => {}),
  setBother: vi.fn(async () => {}),
  getHealthNotes: vi.fn(async () => [{ id: 'n1' }]),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/health/health-repository', () => ({
  declareInjury,
  declareIllness,
  closeInjury,
  closeIllness,
  addHealthNote,
  setBother,
  getHealthNotes,
}));

const {
  declareInjuryAction,
  declareIllnessAction,
  closeInjuryAction,
  closeIllnessAction,
  addHealthNoteAction,
  setBotherAction,
  readHealthNotesAction,
} = await import('./health-actions');

const CANNOT_RUN = { swim: 'full', bike: 'easy', run: 'none' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  resolveAthleteId.mockResolvedValue('athlete_1');
});

describe('declaring', () => {
  it('declares an Injury with what it prevents and an optional Bother Rating', async () => {
    expect(await declareInjuryAction(CANNOT_RUN, 3)).toEqual({ ok: true });
    expect(declareInjury).toHaveBeenCalledWith('athlete_1', CANNOT_RUN, 3);
    expect(await declareInjuryAction(CANNOT_RUN)).toEqual({ ok: true });
    expect(declareInjury).toHaveBeenLastCalledWith('athlete_1', CANNOT_RUN, null);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('refuses a capacity outside the closed set, or one missing a discipline', async () => {
    for (const bad of [
      { swim: 'full', bike: 'easy', run: 'hurt' },
      { swim: 'full', bike: 'easy' },
      { swim: 'full', bike: 'easy', run: 'none', knee: 'left' },
      'none',
      null,
    ]) {
      expect(await declareInjuryAction(bad as never)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(declareInjury).not.toHaveBeenCalled();
  });

  it('refuses a Bother Rating outside 1–5, or one that is not a whole number', async () => {
    for (const bad of [0, 6, 2.5, -1, 'three', NaN]) {
      expect(await declareInjuryAction(CANNOT_RUN, bad as never)).toEqual({ ok: false, reason: 'invalid' });
      expect(await declareIllnessAction(bad as never)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(declareInjury).not.toHaveBeenCalled();
    expect(declareIllness).not.toHaveBeenCalled();
  });

  it('declares an Illness — one button, nothing per discipline — with an optional rating', async () => {
    expect(await declareIllnessAction(4)).toEqual({ ok: true });
    expect(declareIllness).toHaveBeenCalledWith('athlete_1', 4);
    expect(await declareIllnessAction()).toEqual({ ok: true });
    expect(declareIllness).toHaveBeenLastCalledWith('athlete_1', null);
  });
});

describe('closing, rating, noting', () => {
  it('closes the record the athlete names, scoped to them', async () => {
    expect(await closeInjuryAction('inj_1')).toEqual({ ok: true });
    expect(closeInjury).toHaveBeenCalledWith('athlete_1', 'inj_1');
    expect(await closeIllnessAction('ill_1')).toEqual({ ok: true });
    expect(closeIllness).toHaveBeenCalledWith('athlete_1', 'ill_1');
  });

  it('sets the Bother Rating on an owned record, and clears it with null', async () => {
    expect(await setBotherAction({ injuryId: 'inj_1' }, 2)).toEqual({ ok: true });
    expect(setBother).toHaveBeenCalledWith('athlete_1', { injuryId: 'inj_1' }, 2);
    expect(await setBotherAction({ illnessId: 'ill_1' }, null)).toEqual({ ok: true });
    expect(setBother).toHaveBeenLastCalledWith('athlete_1', { illnessId: 'ill_1' }, null);
    expect(await setBotherAction({ injuryId: 'inj_1' }, 7)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('adds a trimmed note as the athlete, and refuses an empty one', async () => {
    expect(await addHealthNoteAction({ injuryId: 'inj_1' }, '  physio says two weeks  ')).toEqual({ ok: true });
    expect(addHealthNote).toHaveBeenCalledWith('athlete_1', { injuryId: 'inj_1' }, 'athlete', 'physio says two weeks');
    expect(await addHealthNoteAction({ injuryId: 'inj_1' }, '   ')).toEqual({ ok: false, reason: 'invalid' });
    expect(addHealthNote).toHaveBeenCalledTimes(1);
  });

  it('reads the thread on an owned record, and refuses a nameless subject', async () => {
    expect(await readHealthNotesAction({ injuryId: 'inj_1' })).toEqual({ ok: true, notes: [{ id: 'n1' }] });
    expect(getHealthNotes).toHaveBeenCalledWith('athlete_1', { injuryId: 'inj_1' });
    expect(await readHealthNotesAction({} as never)).toEqual({ ok: false, reason: 'invalid' });
    // Both ids at once is not a subject either — the XOR constraint would
    // throw on the insert; it is refused before any write instead.
    expect(await addHealthNoteAction({ injuryId: 'inj_1', illnessId: 'ill_1' } as never, 'note')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(addHealthNote).not.toHaveBeenCalledWith('athlete_1', { injuryId: 'inj_1', illnessId: 'ill_1' }, 'athlete', 'note');
    resolveAthleteId.mockResolvedValue(null);
    expect(await readHealthNotesAction({ injuryId: 'inj_1' })).toEqual({ ok: false, reason: 'not-authenticated' });
  });

  it('refuses a subject that names no record', async () => {
    expect(await addHealthNoteAction({} as never, 'x')).toEqual({ ok: false, reason: 'invalid' });
    expect(await setBotherAction({ injuryId: '' } as never, 3)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('every action refuses a caller it cannot identify', () => {
  it('stores nothing when nobody is signed in', async () => {
    resolveAthleteId.mockResolvedValue(null);
    const refused = { ok: false, reason: 'not-authenticated' };
    expect(await declareInjuryAction(CANNOT_RUN)).toEqual(refused);
    expect(await declareIllnessAction()).toEqual(refused);
    expect(await closeInjuryAction('inj_1')).toEqual(refused);
    expect(await closeIllnessAction('ill_1')).toEqual(refused);
    expect(await addHealthNoteAction({ injuryId: 'inj_1' }, 'x')).toEqual(refused);
    expect(await setBotherAction({ injuryId: 'inj_1' }, 3)).toEqual(refused);
    for (const fn of [declareInjury, declareIllness, closeInjury, closeIllness, addHealthNote, setBother]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('declaring never touches the plan', () => {
  it('imports nothing that could reach a session', () => {
    // The same structural assertion slice 04 made on the repository: a declare
    // that could mutate the plan would need the sessions table or its
    // repository, and this module has neither in reach.
    const src = readFileSync(fileURLToPath(new URL('./health-actions.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/session-repository|sessions\b.*from '@\/db\/schema'/);
  });
});
