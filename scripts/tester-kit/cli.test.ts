import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coach, coachingLink } from '../../src/db/schema';
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
const selectQuery = vi.fn();
function queryChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(selectResults.shift() ?? []),
  };
  for (const verb of ['from', 'innerJoin', 'where', 'limit']) chain[verb] = () => chain;
  return chain;
}
const select = vi.fn(() => {
  selectQuery();
  return queryChain();
});
const inserted: { table: unknown; row: unknown }[] = [];
const insert = vi.fn((table: unknown) => ({
  values: (row: unknown) => {
    inserted.push({ table, row });
    const done = { returning: () => Promise.resolve([{ id: 'coach-new' }]), then: (r: (v: unknown) => void) => r(undefined) };
    return { onConflictDoNothing: () => done, ...done };
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
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\.scratch[\\/]showable-version[\\/]testers[\\/]sarah\.md$/),
      expect.stringContaining('s@x.dk'),
      'utf8',
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

  it('creates the testers folder the first time', async () => {
    existsSync.mockReturnValueOnce(false);
    await main(['--name', 'S', '--email', 's@x.dk']);
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/testers$/), { recursive: true });
  });

  it('a coach gets a coach row and one link per resolved athlete', async () => {
    selectResults.push([{ id: 'ath-a' }], [{ id: 'ath-b' }]);
    await main(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk,b@x.dk']);
    expect(inserted[0]).toEqual({ table: coach, row: { userId: 'user-new' } });
    expect(inserted.slice(1)).toEqual([
      { table: coachingLink, row: { coachId: 'coach-new', athleteId: 'ath-a' } },
      { table: coachingLink, row: { coachId: 'coach-new', athleteId: 'ath-b' } },
    ]);
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
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/3 personas/));
  });
});
