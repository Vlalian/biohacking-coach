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
  /**
   * Top up an existing coach rather than mint a new one: no signup, no welcome
   * email, no register line — just their three personas again. `retire-personas`
   * erases every coach's copies at once, so this is the way back from one
   * command mid-round (ruled 2026-09-23).
   */
  personasOnly: boolean;
  /** Emails of existing athlete accounts to link to this coach. */
  athletes: string[];
}

export type MintArgs = { ok: true; request: MintRequest } | { ok: false; usage: string };

export const USAGE = [
  'usage: mint-tester.ts --name <name> --email <email> [--coach (--athletes a@x,b@y | --personas)] [--production]',
  '       mint-tester.ts --personas-only --email <coach email> [--production]',
].join('\n');

const FLAGS = new Set(['--coach', '--personas', '--personas-only', '--production']);
const VALUES = new Set(['--name', '--email', '--athletes']);

function refuse(why: string): MintArgs {
  return { ok: false, usage: `${why}\n${USAGE}` };
}

/** What argv said: the flags that were present, and the value behind each `--key`. */
interface ReadArgv {
  flags: Set<string>;
  values: Map<string, string>;
}

/** Splits argv into `--key value` pairs and bare flags; the first unknown token refuses. */
function readArgv(argv: readonly string[]): ReadArgv | string {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (FLAGS.has(token)) {
      flags.add(token);
    } else if (VALUES.has(token) && argv[i + 1] !== undefined) {
      values.set(token, argv[i + 1]);
      i += 1;
    } else {
      return `unknown or incomplete argument: ${token}`;
    }
  }
  return { flags, values };
}

/** The coach-only rules, kept apart so `parseMintArgs` stays small. */
function checkCoachRules(request: MintRequest): string | null {
  if (request.personas && !request.coach) return '--personas needs --coach';
  if (request.coach && !request.personas && request.athletes.length === 0) {
    return 'a coach needs someone to coach: --athletes or --personas';
  }
  return null;
}

/**
 * A top-up names an account that already exists, so a name or an athlete list
 * would be read as a request this path does not honour. Refuse rather than
 * ignore them.
 */
function topUpFor(email: string, seen: ReadArgv): MintArgs {
  if (seen.values.has('--name') || seen.values.has('--athletes') || seen.flags.has('--coach') || seen.flags.has('--personas')) {
    return refuse('--personas-only tops up an existing coach: it takes --email alone');
  }
  return {
    ok: true,
    request: { name: '', email, coach: true, personas: true, personasOnly: true, athletes: [] },
  };
}

/** A first mint: someone who does not have a login yet. */
function mintFor(email: string, seen: ReadArgv): MintArgs {
  const name = seen.values.get('--name');
  if (!name) return refuse('--name is required');

  const request: MintRequest = {
    name,
    email,
    coach: seen.flags.has('--coach'),
    personas: seen.flags.has('--personas'),
    personasOnly: false,
    athletes: (seen.values.get('--athletes') ?? '')
      .toLowerCase()
      .split(',')
      .filter((e) => e.length > 0),
  };
  const why = checkCoachRules(request);
  return why ? refuse(why) : { ok: true, request };
}

export function parseMintArgs(argv: readonly string[]): MintArgs {
  const seen = readArgv(argv);
  if (typeof seen === 'string') return refuse(seen);
  // better-auth stores an email lower-cased, and the lookups behind
  // `--athletes` and `--personas-only` compare on it exactly.
  const email = seen.values.get('--email')?.toLowerCase();
  if (!email) return refuse('--email is required');
  return seen.flags.has('--personas-only') ? topUpFor(email, seen) : mintFor(email, seen);
}

/**
 * One database step of a mint, in the order the CLI runs them. The two link
 * steps are separate kinds because they resolve differently: a persona by the
 * label `seedPersonas` just wrote, an athlete by an email that must already
 * belong to an account.
 */
export type MintStep =
  | { kind: 'signUp' }
  | { kind: 'ensureCoach' }
  | { kind: 'seedPersonas'; ownerKey: string }
  | { kind: 'linkPersona'; persona: string }
  | { kind: 'linkAthlete'; athleteEmail: string };

/** The owner key a coach's persona copy derives its ids from: the email, lower-cased. */
export function ownerKeyFor(email: string): string {
  return email.toLowerCase();
}

function personaSteps(request: MintRequest): MintStep[] {
  if (!request.personas) return [];
  return [
    { kind: 'seedPersonas', ownerKey: ownerKeyFor(request.email) },
    ...PERSONA_LABELS.map((persona): MintStep => ({ kind: 'linkPersona', persona })),
  ];
}

export function planMint(request: MintRequest): MintStep[] {
  // A top-up plans no account step at all: the coach exists, and the run looks
  // them up by the email it was given rather than by a step repeating it.
  if (request.personasOnly) return personaSteps(request);
  if (!request.coach) return [{ kind: 'signUp' }];
  return [
    { kind: 'signUp' },
    { kind: 'ensureCoach' },
    ...personaSteps(request),
    ...request.athletes.map((athleteEmail): MintStep => ({ kind: 'linkAthlete', athleteEmail })),
  ];
}

/**
 * What the register records: who, which role, what they coach, when. The
 * password is not a parameter, which is the strongest form of "never written
 * here" available — the register is the one file that outlives the round.
 */
export function registerLine(request: MintRequest, mintedAt: Date): string {
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

/** The header a new register opens with, so the rows beneath it read as a table. */
export const REGISTER_HEADER = ['| Minted | Name | Email | Role |', '| --- | --- | --- | --- |'].join('\n');
