import type { CoachTool, CoachToolCall } from './coach-client';

/**
 * The Coach Actions catalog (`coach-actions/02`, ADR 0008): the closed set of
 * things the Coach can do in the app besides talk, as data.
 *
 * Framework-free — no database, no UI, no SDK. Adding an action is one entry
 * in {@link COACH_ACTION_CATALOG} and one client handler; the validator, the
 * tool definitions and the chat result are all generic over the catalog and
 * never name an action. Durability is a property of the entry, carried through
 * on the action for whoever acts on it — nothing here branches on it.
 */

/** One declared payload field. The shape of a payload is data, not code. */
export type PayloadField =
  | { readonly kind: 'enum'; readonly values: string[]; readonly description: string }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number; readonly description: string }
  | { readonly kind: 'string'; readonly description: string };

export interface CoachActionDefinition {
  readonly name: string;
  readonly description: string;
  /** Ephemeral actions are performed; durable ones are proposed (ADR 0008). */
  readonly durability: 'ephemeral' | 'durable';
  readonly payload: Readonly<Record<string, PayloadField>>;
  /** What the Coach is told after the action was performed. Neutral words when omitted. */
  readonly ack?: string;
  /** What the Coach is told when the action was refused: nothing happened. Neutral words when omitted. */
  readonly refusedAck?: string;
}

const DEFAULT_ACK = 'That action was performed. Say briefly what happened.';
const DEFAULT_REFUSED_ACK = 'Nothing happened — that action was not available. Say in words what to do instead.';

/** A validated action: selection only, never content. */
export interface CoachAction {
  name: string;
  durability: CoachActionDefinition['durability'];
  payload: Record<string, unknown>;
}

export type CoachActionRefusal = 'unknown-action' | 'malformed' | 'out-of-range';

export type CoachActionValidation =
  | { ok: true; action: CoachAction }
  | { ok: false; reason: CoachActionRefusal };

/**
 * The Views an athlete can reach from the drawer. Repeats `ATHLETE_VIEWS` in
 * the app layout because this module cannot import the client shell; the
 * client handler narrows to the Views actually available, so drift is a no-op,
 * never a wrong page.
 */
const OPENABLE_VIEWS = ['training-plan', 'information', 'equipment', 'glossary', 'settings', 'privacy'];

export const COACH_ACTION_CATALOG: readonly CoachActionDefinition[] = [
  {
    name: 'open_view',
    description:
      'Open one of the app’s Views on the athlete’s screen. Call it only when the athlete asks where ' +
      'something is or asks to be taken there, and still answer in words.',
    durability: 'ephemeral',
    payload: {
      view: {
        kind: 'enum',
        values: OPENABLE_VIEWS,
        description: 'The View to open.',
      },
    },
    ack: 'That View is now open on the athlete’s screen. Say briefly where they are now.',
    refusedAck: 'Nothing opened — that action was not available. Say in words where to find it instead.',
  },
];

type FieldVerdict = 'ok' | 'malformed' | 'out-of-range';

function checkEnum(field: Extract<PayloadField, { kind: 'enum' }>, value: unknown): FieldVerdict {
  if (typeof value !== 'string') return 'malformed';
  return field.values.includes(value) ? 'ok' : 'out-of-range';
}

function checkInteger(field: Extract<PayloadField, { kind: 'integer' }>, value: unknown): FieldVerdict {
  // Number.isInteger is false for every non-number, so no separate typeof test is needed.
  if (!Number.isInteger(value)) return 'malformed';
  const n = value as number;
  return n >= field.min && n <= field.max ? 'ok' : 'out-of-range';
}

function checkField(field: PayloadField, value: unknown): FieldVerdict {
  switch (field.kind) {
    case 'enum':
      return checkEnum(field, value);
    case 'integer':
      return checkInteger(field, value);
    case 'string':
      return typeof value === 'string' ? 'ok' : 'malformed';
  }
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** Checks the input against the entry's declared fields; only those fields reach the payload. */
function checkPayload(
  entry: CoachActionDefinition,
  input: unknown,
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: CoachActionRefusal } {
  if (!isPlainRecord(input)) return { ok: false, reason: 'malformed' };
  const payload: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(entry.payload)) {
    const verdict = checkField(field, input[key]);
    if (verdict !== 'ok') return { ok: false, reason: verdict };
    payload[key] = input[key];
  }
  return { ok: true, payload };
}

/**
 * Turns untrusted model output into a typed action, or a refusal reason. Looks
 * the name up in the catalog and checks the input against the entry's declared
 * fields; only declared fields reach the payload. Never throws.
 */
export function validateCoachAction(
  call: CoachToolCall,
  catalog: readonly CoachActionDefinition[] = COACH_ACTION_CATALOG,
): CoachActionValidation {
  const entry = catalog.find((e) => e.name === call.name);
  if (!entry) return { ok: false, reason: 'unknown-action' };
  const result = checkPayload(entry, call.input);
  if (!result.ok) return result;
  return { ok: true, action: { name: entry.name, durability: entry.durability, payload: result.payload } };
}

function fieldSchema(field: PayloadField): Record<string, unknown> {
  switch (field.kind) {
    case 'enum':
      return { type: 'string', enum: [...field.values], description: field.description };
    case 'integer':
      return { type: 'integer', minimum: field.min, maximum: field.max, description: field.description };
    case 'string':
      return { type: 'string', description: field.description };
  }
}

/** One tool per catalog entry, its input schema generated from the payload shape. */
export function coachActionTools(catalog: readonly CoachActionDefinition[] = COACH_ACTION_CATALOG): CoachTool[] {
  return catalog.map((entry) => ({
    name: entry.name,
    description: entry.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(entry.payload).map(([key, field]) => [key, fieldSchema(field)])),
      required: Object.keys(entry.payload),
      additionalProperties: false,
    },
  }));
}

/**
 * What the Coach is told about a catalog action call: the entry's `ack` when it
 * validates, its `refusedAck` when it does not. Null when the name is outside
 * the catalog, so the caller can route the call elsewhere.
 */
export function coachActionReply(
  call: CoachToolCall,
  catalog: readonly CoachActionDefinition[] = COACH_ACTION_CATALOG,
): string | null {
  const entry = catalog.find((e) => e.name === call.name);
  if (!entry) return null;
  return validateCoachAction(call, catalog).ok
    ? (entry.ack ?? DEFAULT_ACK)
    : (entry.refusedAck ?? DEFAULT_REFUSED_ACK);
}

/** Whether a tool call names a catalog entry, valid or not. */
export function isCoachActionCall(
  call: CoachToolCall,
  catalog: readonly CoachActionDefinition[] = COACH_ACTION_CATALOG,
): boolean {
  return catalog.some((e) => e.name === call.name);
}

/** The valid actions among a reply's tool calls, in call order; the rest are dropped. */
export function actionsFromToolCalls(
  calls: readonly CoachToolCall[],
  catalog: readonly CoachActionDefinition[] = COACH_ACTION_CATALOG,
): CoachAction[] {
  return calls.flatMap((call) => {
    const result = validateCoachAction(call, catalog);
    return result.ok ? [result.action] : [];
  });
}
