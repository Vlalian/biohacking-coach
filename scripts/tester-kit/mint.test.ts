import { describe, it, expect } from 'vitest';
import { generatePassword, isDuplicateUser, parseMintArgs, planMint, registerLine, renderWelcome } from './mint';

/**
 * The tester-kit's pure core (showable-version/04): what a login for one
 * tester is, before anything touches a database.
 */
describe('generatePassword', () => {
  it('makes a long password from the unambiguous alphabet, different every time', () => {
    const pw = generatePassword();
    expect(pw.length).toBeGreaterThanOrEqual(16);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(new Set(Array.from({ length: 50 }, generatePassword)).size).toBe(50);
  });
});

describe('parseMintArgs', () => {
  it('refuses a missing name or email, saying which, then the usage line', () => {
    expect(parseMintArgs(['--email', 's@x.dk'])).toMatchObject({
      ok: false,
      usage: expect.stringMatching(/^--name is required\nusage: mint-tester\.ts --name <name> --email <email>/),
    });
    expect(parseMintArgs(['--name', 'Sarah'])).toMatchObject({
      ok: false,
      usage: expect.stringMatching(/^--email is required\n/),
    });
  });

  it('refuses a value flag with nothing after it', () => {
    expect(parseMintArgs(['--name', 'Sarah', '--email'])).toMatchObject({
      ok: false,
      usage: expect.stringMatching(/^unknown or incomplete argument: --email\n/),
    });
  });

  it('refuses a coach with nobody to coach', () => {
    expect(parseMintArgs(['--name', 'Sarah', '--email', 's@x.dk', '--coach'])).toMatchObject({
      ok: false,
      usage: expect.stringMatching(/^a coach needs someone to coach: --athletes or --personas\n/),
    });
  });

  it('splits --athletes on commas', () => {
    expect(
      parseMintArgs(['--name', 'C', '--email', 'c@x.dk', '--coach', '--athletes', 'a@x.dk,b@x.dk']),
    ).toMatchObject({ ok: true, request: { coach: true, athletes: ['a@x.dk', 'b@x.dk'] } });
  });

  it('an athlete is the default: no coach, no athletes, no personas', () => {
    expect(parseMintArgs(['--name', 'Sarah', '--email', 's@x.dk'])).toEqual({
      ok: true,
      request: { name: 'Sarah', email: 's@x.dk', coach: false, personas: false, athletes: [] },
    });
  });

  // code-health/18: a tester coach gets their own copy of the three personas.
  it('accepts a coach with --personas and no --athletes', () => {
    expect(parseMintArgs(['--name', 'C', '--email', 'c@x.dk', '--coach', '--personas'])).toMatchObject({
      ok: true,
      request: { coach: true, personas: true, athletes: [] },
    });
  });

  it('refuses --personas on an athlete', () => {
    expect(parseMintArgs(['--name', 'S', '--email', 's@x.dk', '--personas'])).toMatchObject({
      ok: false,
      usage: expect.stringMatching(/^--personas needs --coach\n/),
    });
  });

  it('lets --production through to the guard and refuses anything else it does not know', () => {
    expect(parseMintArgs(['--name', 'S', '--email', 's@x.dk', '--production'])).toMatchObject({ ok: true });
    expect(parseMintArgs(['--name', 'S', '--email', 's@x.dk', '--bogus'])).toMatchObject({
      ok: false,
      usage: expect.stringMatching(/^unknown or incomplete argument: --bogus\n/),
    });
  });
});

describe('planMint', () => {
  it('plans an athlete as one signUp', () => {
    expect(planMint({ name: 'S', email: 's@x.dk', coach: false, personas: false, athletes: [] })).toEqual([
      { kind: 'signUp' },
    ]);
  });

  it('plans the coach as signUp, ensureCoach, then one link per athlete', () => {
    expect(
      planMint({ name: 'C', email: 'c@x.dk', coach: true, personas: false, athletes: ['a@x.dk', 'b@x.dk'] }).map(
        (s) => s.kind,
      ),
    ).toEqual(['signUp', 'ensureCoach', 'linkAthlete', 'linkAthlete']);
  });

  // code-health/18
  it('plans a coach with personas as signUp, ensureCoach, seedPersonas, three links, then the athlete links', () => {
    const steps = planMint({ name: 'C', email: 'C@X.dk', coach: true, personas: true, athletes: ['a@x.dk'] });
    expect(steps.map((s) => s.kind)).toEqual([
      'signUp',
      'ensureCoach',
      'seedPersonas',
      'linkPersona',
      'linkPersona',
      'linkPersona',
      'linkAthlete',
    ]);
    expect(steps[2]).toEqual({ kind: 'seedPersonas', ownerKey: 'c@x.dk' });
    expect(steps.slice(3, 6)).toEqual([
      { kind: 'linkPersona', persona: 'Alex Rivera' },
      { kind: 'linkPersona', persona: 'Sam Chen' },
      { kind: 'linkPersona', persona: 'Nadia Holm' },
    ]);
    expect(steps[6]).toEqual({ kind: 'linkAthlete', athleteEmail: 'a@x.dk' });
  });
});

describe('registerLine', () => {
  it('registers who and when — and has no way to write the secret, because it is never given it', () => {
    const line = registerLine(
      { name: 'Sarah', email: 's@x.dk', coach: false, personas: false, athletes: [] },
      new Date('2026-09-18T10:00Z'),
    );
    expect(line).toBe('| 2026-09-18 | Sarah | s@x.dk | athlete |');
  });

  it('does not call an athlete a persona coach, whatever else is set', () => {
    const line = registerLine(
      { name: 'Tom', email: 't@x.dk', coach: true, personas: false, athletes: ['a@x.dk'] },
      new Date('2026-09-18T10:00Z'),
    );
    expect(line).toBe('| 2026-09-18 | Tom | t@x.dk | coach — coaches a@x.dk |');
  });

  it('names a coach as such, with what they coach', () => {
    const line = registerLine(
      { name: 'Tom', email: 't@x.dk', coach: true, personas: true, athletes: ['a@x.dk'] },
      new Date('2026-09-18T10:00Z'),
    );
    expect(line).toBe('| 2026-09-18 | Tom | t@x.dk | coach — coaches personas, a@x.dk |');
  });
});

describe('renderWelcome', () => {
  const TEMPLATE = ['## en', 'Hi {{name}} {{email}} {{password}}', '## da', 'Hej {{name}} {{email}} {{password}}'].join('\n');

  it('fills both languages and leaves no placeholder', () => {
    const out = renderWelcome(TEMPLATE, { name: 'Sarah', email: 's@x.dk', password: 'pw' });
    expect(out).not.toMatch(/{{\w+}}/);
    expect(out.match(/s@x\.dk/g)).toHaveLength(2);
    expect(out.match(/Sarah/g)).toHaveLength(2);
  });

  it('refuses a template without the Danish section', () => {
    expect(() => renderWelcome('## en\n{{email}}', { name: 'S', email: 'e', password: 'p' })).toThrow(
      'welcome template has no ## da section',
    );
    expect(() => renderWelcome('## da\n{{email}}', { name: 'S', email: 'e', password: 'p' })).toThrow(
      'welcome template has no ## en section',
    );
  });

  it('refuses a template with a placeholder it cannot fill', () => {
    expect(() =>
      renderWelcome('## en\n{{name}} {{link}}\n## da\n{{name}}', { name: 'S', email: 'e', password: 'p' }),
    ).toThrow('welcome template asks for {{link}}, which the kit does not fill');
  });
});

describe('the shipped welcome template', () => {
  it('renders in both languages, names the password change and /privacy, and fills every placeholder', async () => {
    const { readFileSync } = await import('node:fs');
    const template = readFileSync(new URL('./welcome-email.md', import.meta.url), 'utf8');
    const out = renderWelcome(template, { name: 'Sarah', email: 's@x.dk', password: 'Secret2345' });
    expect(out).not.toMatch(/{{\w+}}/);
    expect(out.match(/s@x\.dk/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out.match(/Secret2345/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).toContain('https://biohacking-coach-hazel.vercel.app');
    expect(out).toContain('/privacy');
    expect(out).toMatch(/Settings.*Profile/);
    expect(out).toMatch(/Indstillinger.*Profil/);
  });
});

describe('isDuplicateUser', () => {
  it('trusts the stable code better-auth puts on the error body', () => {
    expect(isDuplicateUser({ body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' } })).toBe(true);
    expect(isDuplicateUser({ body: { code: 'INVALID_EMAIL' }, message: 'already exists' })).toBe(false);
  });

  it('survives an error that is not an object at all', () => {
    expect(isDuplicateUser(undefined)).toBe(false);
    expect(isDuplicateUser(null)).toBe(false);
    expect(isDuplicateUser({})).toBe(false);
  });

  it('falls back to the message only when there is no code', () => {
    expect(isDuplicateUser(new Error('User already exists'))).toBe(true);
    expect(isDuplicateUser('email exists')).toBe(true);
    expect(isDuplicateUser(new Error('network down'))).toBe(false);
    expect(isDuplicateUser({ body: {} })).toBe(false);
  });
});
