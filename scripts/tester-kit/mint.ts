import { randomBytes } from 'node:crypto';
import { PERSONA_LABELS } from '../../src/features/athlete/synthetic-history';

/**
 * The tester-kit's pure core (showable-version/04).
 *
 * Registration is closed on the deployment, so every tester is minted a login
 * by hand: a password, a plan of database steps, a register line, and the
 * welcome email. Everything here is a pure function of its arguments; the
 * database, better-auth and the filesystem live in `scripts/mint-tester.ts`.
 */

/**
 * Unambiguous characters only — no 0/O, 1/l/I — because the password is read
 * off an email and typed on a phone.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 20;

export function generatePassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** One tester to mint, as the command line describes them. */
export interface MintRequest {
  name: string;
  email: string;
  /** A Head Coach tester: gets a coach row and Coaching Links. */
  coach: boolean;
  /** Seed this coach their own copy of the three personas (code-health/18). */
  personas: boolean;
  /** Emails of existing athlete accounts to link to this coach. */
  athletes: string[];
}

export type MintArgs = { ok: true; request: MintRequest } | { ok: false; usage: string };

export const USAGE =
  'usage: mint-tester.ts --name <name> --email <email> [--coach (--athletes a@x,b@y | --personas)] [--production]';

const FLAGS = new Set(['--coach', '--personas', '--production']);
const VALUES = new Set(['--name', '--email', '--athletes']);

function refuse(why: string): MintArgs {
  return { ok: false, usage: `${why}\n${USAGE}` };
}

/** Splits argv into `--key value` pairs and bare flags; the first unknown token refuses. */
function readArgv(argv: readonly string[]): Map<string, string> | string {
  const seen = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (FLAGS.has(token)) {
      seen.set(token, 'true');
    } else if (VALUES.has(token) && argv[i + 1] !== undefined) {
      seen.set(token, argv[i + 1]);
      i += 1;
    } else {
      return `unknown or incomplete argument: ${token}`;
    }
  }
  return seen;
}

/** The coach-only rules, kept apart so `parseMintArgs` stays small. */
function checkCoachRules(request: MintRequest): string | null {
  if (request.personas && !request.coach) return '--personas needs --coach';
  if (request.coach && !request.personas && request.athletes.length === 0) {
    return 'a coach needs someone to coach: --athletes or --personas';
  }
  return null;
}

export function parseMintArgs(argv: readonly string[]): MintArgs {
  const seen = readArgv(argv);
  if (typeof seen === 'string') return refuse(seen);
  const name = seen.get('--name');
  const email = seen.get('--email');
  if (!name) return refuse('--name is required');
  if (!email) return refuse('--email is required');

  const request: MintRequest = {
    name,
    email,
    coach: seen.has('--coach'),
    personas: seen.has('--personas'),
    athletes: (seen.get('--athletes') ?? '').split(',').filter((e) => e.length > 0),
  };
  const why = checkCoachRules(request);
  return why ? refuse(why) : { ok: true, request };
}

/**
 * One database step of a mint, in the order the CLI runs them. `link` carries
 * either a persona label (resolved to the id `seedPersonas` returns) or an
 * athlete's email (resolved to an existing athlete row before any write).
 */
export type MintStep =
  | { kind: 'signUp' }
  | { kind: 'ensureCoach' }
  | { kind: 'seedPersonas'; ownerKey: string }
  | { kind: 'link'; persona: string }
  | { kind: 'link'; athleteEmail: string };

/** The owner key a coach's persona copy derives its ids from: the email, lower-cased. */
export function ownerKeyFor(email: string): string {
  return email.toLowerCase();
}

function personaSteps(request: MintRequest): MintStep[] {
  if (!request.personas) return [];
  return [
    { kind: 'seedPersonas', ownerKey: ownerKeyFor(request.email) },
    ...PERSONA_LABELS.map((persona): MintStep => ({ kind: 'link', persona })),
  ];
}

export function planMint(request: MintRequest): MintStep[] {
  if (!request.coach) return [{ kind: 'signUp' }];
  return [
    { kind: 'signUp' },
    { kind: 'ensureCoach' },
    ...personaSteps(request),
    ...request.athletes.map((athleteEmail): MintStep => ({ kind: 'link', athleteEmail })),
  ];
}

/**
 * What the register records: who, which role, what they coach, when — never
 * the password. The signature takes it anyway so the test can prove it stays
 * out; the register is the one file that outlives the round.
 */
export function registerLine(request: MintRequest, mintedAt: Date, password: string): string {
  void password;
  const role = request.coach ? 'coach' : 'athlete';
  const coaches = [
    ...(request.personas ? ['personas'] : []),
    ...request.athletes,
  ];
  const scope = request.coach ? ` — coaches ${coaches.join(', ')}` : '';
  return `| ${mintedAt.toISOString().slice(0, 10)} | ${request.name} | ${request.email} | ${role}${scope} |`;
}

export interface WelcomeFields {
  name: string;
  email: string;
  password: string;
}

/**
 * Fills `{{name}} {{email}} {{password}}` in a bilingual template. Refuses a
 * template missing either language section or carrying a placeholder these
 * fields cannot fill — a half-filled email is worse than no email.
 */
export function renderWelcome(template: string, fields: WelcomeFields): string {
  for (const section of ['## en', '## da']) {
    if (!template.includes(section)) throw new Error(`welcome template has no ${section} section`);
  }
  const out = template.replace(/{{(\w+)}}/g, (_, key: string) => {
    const value = fields[key as keyof WelcomeFields];
    if (value === undefined) throw new Error(`welcome template asks for {{${key}}}, which the kit does not fill`);
    return value;
  });
  return out;
}

/**
 * better-auth surfaces an existing email as a known, non-fatal condition.
 *
 * Prefer the stable error code it carries on the APIError body over the human
 * message: the message is prose and can be reworded, but the code is the
 * library's contract. Fall back to the message only when no code is present.
 */
export function isDuplicateUser(err: unknown): boolean {
  const code = (err as { body?: { code?: string } })?.body?.code;
  if (code) return code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

  const message = err instanceof Error ? err.message : String(err);
  return /exist|already/i.test(message);
}
