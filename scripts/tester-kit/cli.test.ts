import { describe, it, expect, vi, beforeEach } from 'vitest';
import { athlete, coach, coachingLink } from '../../src/db/schema';
import { personasFor } from '../../src/features/athlete/synthetic-history';

/**
 * The mint script's shell (showable-version/04, code-health/18). The pure
 * decisions live in `mint.ts`; this file proves the order and the refusals of
 * the run itself: the guard before any write, every athlete resolved before
 * any insert, nothing filed on a duplicate, the login printed once.
 */
const guardDatabase = vi.fn();
vi.mock('../db-guard/protected-database', () => ({ guardDatabase }));

const signUpEmail = vi.fn(() => Promise.resolve({ user: { id: 'user-new' } }));
vi.mock('../../src/lib/auth', () => ({ auth: { api: { signUpEmail } } }));

const seedPersonas = vi.fn(() => Promise.resolve(['p1', 'p2', 'p3']));
vi.mock('../personas/seed-personas', () => ({ seedPersonas }));

const writeFileSync = vi.fn();
const appendFileSync = vi.fn();
const mkdirSync = vi.fn();
const readFileSync = vi.fn(() => '## en\nHi {{name}} {{email}} {{password}}\n## da\nHej {{name}} {{email}} {{password}}');
const existsSync = vi.fn(() => true);
vi.mock('node:fs', () => ({ writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync }));

/** Each select resolves to the next queued result; a chain accepts any of the builder's verbs. */
const selectResults: unknown[][] = [];
const selectShapes: unknown[] = [];
function queryChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(selectResults.shift() ?? []),
  };
  for (const verb of ['from', 'innerJoin', 'where', 'limit']) chain[verb] = () => chain;
  return chain;
}
const select = vi.fn((shape: unknown) => {
  selectShapes.push(shape);
  return queryChain();
});
const inserted: { table: unknown; row: unknown }[] = [];
const conflictTargets: unknown[] = [];
const returningShapes: unknown[] = [];
/** What the coach insert's `returning()` hands back; emptied to mean "the conflict clause won". */
const returningRows: { id: string }[] = [{ id: 'coach-new' }];
const insert = vi.fn((table: unknown) => ({
  values: (row: unknown) => {
    inserted.push({ table, row });
    const done = {
      returning: (shape: unknown) => {
        returningShapes.push(shape);
        return Promise.resolve([...returningRows]);
      },
      then: (r: (v: unknown) => void) => r(undefined),
    };
    return {
      onConflictDoNothing: (clause?: { target: unknown }) => {
        conflictTargets.push(clause?.target ?? null);
        return done;
      },
      ...done,
    };
  },
}));
vi.mock('../../src/db', () => ({ getDb: () => ({ select, insert }) }));

const { main } = await import('./cli');

describe('mint-tester CLI', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    inserted.length = 0;
    returningRows.splice(0, returningRows.length, { id: 'coach-new' });
    selectShapes.length = 0;
    conflictTargets.length = 0;
    returningShapes.length = 0;
    existsSync.mockReturnValue(true);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('refuses argv it cannot read, before anything else', async () => {
    await expect(main(['--email', 's@x.dk'])).rejects.toThrow(/^--name is required\nusage: mint-tester\.ts/);
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('lets an error that is not a duplicate through as it is', async () => {
    signUpEmail.mockRejectedValueOnce(new Error('connection refused'));
    await expect(main(['--name', 'S', '--email', 's@x.dk'])).rejects.toThrow('connection refused');
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('guards the database before touching it', async () => {
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(guardDatabase).toHaveBeenCalledWith(process.env.DATABASE_URL, ['--name', 'S', '--email', 's@x.dk']);
    expect(guardDatabase.mock.invocationCallOrder[0]).toBeLessThan(signUpEmail.mock.invocationCallOrder[0]);
  });

  it('stops on a duplicate email and files nothing', async () => {
    signUpEmail.mockRejectedValueOnce({ body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' } });
    await expect(main(['--name', 'S', '--email', 's@x.dk'])).rejects.toThrow(/already has a login/);
    expect(appendFileSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('refuses a coach whose athlete does not exist, before inserting anything', async () => {
    selectResults.push([]); // ghost@x.dk resolves to no athlete row
    await expect(
      main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'ghost@x.dk']),
    ).rejects.toThrow(/ghost@x\.dk/);
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('files the email, appends the register, prints the login once', async () => {
    await main(['--name', 'Sarah Ø', '--email', 's@x.dk']);
    expect(signUpEmail).toHaveBeenCalledWith({
      body: { name: 'Sarah Ø', email: 's@x.dk', password: expect.stringMatching(/^[A-HJ-NP-Za-km-z2-9]{20}$/) },
    });
    expect(readFileSync).toHaveBeenCalledWith(expect.stringMatching(/tester-kit[\\/]welcome-email\.md$/), 'utf8');
    // The password is in this file, so it lives outside every git repo: the
    // tracker is a repo with a remote, and a temporary password stays live
    // until the tester changes it (ruling, 2026-09-23).
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/tester-emails[\\/]sarah-oe\.md$/),
      expect.stringContaining('s@x.dk'),
      'utf8',
    );
    expect(writeFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('.scratch'),
      expect.anything(),
      expect.anything(),
    );
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\.scratch[\\/]showable-version[\\/]testers[\\/]REGISTER\.md$/),
      expect.stringMatching(/s@x\.dk.*athlete/),
      'utf8',
    );
    const printed = log.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => /[A-HJ-NP-Za-km-z2-9]{20}/.test(l));
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('s@x.dk');
  });

  it('creates both folders the first time, and opens the register with a header', async () => {
    existsSync.mockReturnValue(false);
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/tester-emails$/), { recursive: true });
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/testers$/), { recursive: true });
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/REGISTER\.md$/),
      expect.stringMatching(/^\| Minted \| Name \| Email \| Role \|\n\| --- \| --- \| --- \| --- \|\n\| \d{4}-/),
      'utf8',
    );
  });

  it('appends one row to a register that exists, with nothing in front of it', async () => {
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/REGISTER\.md$/),
      expect.stringMatching(/^\| \d{4}-\d{2}-\d{2} \| S \| s@x\.dk \| athlete \|\n$/),
      'utf8',
    );
  });

  it('says where it filed the email, since it is not where the tracker is', async () => {
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(log.mock.calls.map((c: unknown[]) => String(c[0]))).toContainEqual(
      expect.stringMatching(/filed .*tester-emails[\\/]s\.md/),
    );
  });

  it('prints one line naming the role and the login', async () => {
    await main(['--name', 'S', '--email', 's@x.dk']);
    const printed = log.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(printed).toContainEqual(expect.stringMatching(/^minted athlete s@x\.dk [A-HJ-NP-Za-km-z2-9]{20}$/));
    selectResults.push([{ id: 'ath-a' }]);
    await main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk']);
    expect(log.mock.calls.map((c: unknown[]) => String(c[0]))).toContainEqual(
      expect.stringMatching(/^minted coach c@x\.dk /),
    );
  });

  it('folds an accent into plain ascii too', async () => {
    await main(['--name', 'Renée Dupré', '--email', 'r@x.dk']);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/renee-dupre\.md$/),
      expect.any(String),
      'utf8',
    );
  });

  it('resolves one lookup per athlete email and none for a persona link', async () => {
    selectResults.push([{ id: 'ath-a' }], [{ id: 'ath-b' }]);
    await main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk,b@x.dk', '--personas']);
    // Two lookups, not five: the three persona links carry a label, not an email.
    expect(selectShapes).toEqual([{ id: athlete.id }, { id: athlete.id }]);
    expect(inserted.slice(1).map((i) => (i.row as { athleteId: string }).athleteId)).toEqual([
      'p1',
      'p2',
      'p3',
      'ath-a',
      'ath-b',
    ]);
  });

  it('a coach gets a coach row and one link per resolved athlete', async () => {
    selectResults.push([{ id: 'ath-a' }], [{ id: 'ath-b' }]);
    await main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk,b@x.dk']);
    expect(inserted[0]).toEqual({ table: coach, row: { userId: 'user-new' } });
    // The row is claimed by the user it belongs to, and its id is what comes back.
    expect(conflictTargets[0]).toBe(coach.userId);
    expect(returningShapes[0]).toEqual({ id: coach.id });
    expect(conflictTargets.slice(1)).toEqual([null, null]);
    expect(inserted.slice(1)).toEqual([
      { table: coachingLink, row: { coachId: 'coach-new', athleteId: 'ath-a' } },
      { table: coachingLink, row: { coachId: 'coach-new', athleteId: 'ath-b' } },
    ]);
  });

  it('leaves an existing folder alone', async () => {
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('names the file after the tester, with the Danish letters spelled out', async () => {
    await main(['--name', 'Søren Æ. Berg-Håansen!', '--email', 's@x.dk']);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/soeren-ae-berg-haaansen\.md$/),
      expect.any(String),
      'utf8',
    );
  });

  it('an athlete gets no coach row and no link', async () => {
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(inserted).toEqual([]);
  });

  it('links to the coach row that already exists when the insert is a no-op', async () => {
    returningRows.length = 0; // the conflict clause inserted nothing
    // The athlete is resolved first, before any write; the coach lookup follows.
    selectResults.push([{ id: 'ath-a' }], [{ id: 'coach-existing' }]);
    await main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk']);
    expect(inserted.at(-1)).toEqual({
      table: coachingLink,
      row: { coachId: 'coach-existing', athleteId: 'ath-a' },
    });
    // The fallback asks for the coach row's id, keyed on the user it belongs to.
    expect(selectShapes).toEqual([{ id: athlete.id }, { id: coach.id }]);
  });

  it('stops if the coach row is neither inserted nor found', async () => {
    returningRows.length = 0;
    selectResults.push([{ id: 'ath-a' }], []);
    await expect(main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk'])).rejects.toThrow(
      /coach row missing/,
    );
  });

  it('links the persona each plan step names, through the ids the seed wrote', async () => {
    // The plan lists labels and the seed returns ids in profile order; the run
    // pairs them, so a plan step that names nobody stops it (review, 2026-09-22).
    await main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--personas']);
    expect(seedPersonas).toHaveBeenCalledWith(personasFor('c@x.dk'), expect.any(Date), expect.any(Function));
    expect(inserted.slice(1).map((i) => (i.row as { athleteId: string }).athleteId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('stops if the seed wrote fewer personas than the plan asked to link', async () => {
    seedPersonas.mockResolvedValueOnce(['alex-id']);
    await expect(main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--personas'])).rejects.toThrow(
      /the seed wrote no persona called Sam Chen/,
    );
  });

  // code-health/18
  it("seeds the coach's own persona copy and links the ids it got back", async () => {
    await main(['--name', 'C', '--email', 'C@X.dk', '--coach', '--personas']);
    expect(seedPersonas).toHaveBeenCalledWith(personasFor('c@x.dk'), expect.any(Date), expect.any(Function));
    expect(inserted.slice(1).map((i) => i.row)).toEqual([
      { coachId: 'coach-new', athleteId: 'p1' },
      { coachId: 'coach-new', athleteId: 'p2' },
      { coachId: 'coach-new', athleteId: 'p3' },
    ]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/holds their own copy of 3 personas/));
  });
});

describe('--personas-only — the way back after a retire (ruled 2026-09-23)', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    inserted.length = 0;
    selectShapes.length = 0;
    existsSync.mockReturnValue(true);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('seeds and links an existing coach, without signing anybody up or filing anything', async () => {
    selectResults.push([{ id: 'coach-existing' }]);
    await main(['--personas-only', '--email', 'C@X.dk']);

    expect(signUpEmail).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(appendFileSync).not.toHaveBeenCalled();
    // The copy is the one that coach already owns: same owner key, same ids.
    expect(seedPersonas).toHaveBeenCalledWith(personasFor('c@x.dk'), expect.any(Date), expect.any(Function));
    expect(inserted.map((i) => i.row)).toEqual([
      { coachId: 'coach-existing', athleteId: 'p1' },
      { coachId: 'coach-existing', athleteId: 'p2' },
      { coachId: 'coach-existing', athleteId: 'p3' },
    ]);
    // Found through the account's email, and it is the coach row that comes back.
    expect(selectShapes).toEqual([{ id: coach.id }]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^topped up c@x\.dk with 3 personas$/));
  });

  it('refuses an email with no coach row behind it, before writing anything', async () => {
    selectResults.push([]);
    await expect(main(['--personas-only', '--email', 'ghost@x.dk'])).rejects.toThrow(
      /no coach account for ghost@x\.dk/,
    );
    expect(seedPersonas).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('guards the database first, like every other path', async () => {
    selectResults.push([{ id: 'coach-existing' }]);
    await main(['--personas-only', '--email', 'c@x.dk']);
    expect(guardDatabase).toHaveBeenCalledWith(process.env.DATABASE_URL, ['--personas-only', '--email', 'c@x.dk']);
    expect(guardDatabase.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0]);
  });
});
