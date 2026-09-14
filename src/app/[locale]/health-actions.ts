'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import { ALLOWANCES, DISCIPLINES, type Capacity } from '@/features/health/capacity';
import {
  addHealthNote,
  closeIllness,
  closeInjury,
  declareIllness,
  declareInjury,
  getHealthNotes,
  setBother,
  type Bother,
} from '@/features/health/health-repository';
import type { HealthNoteRow } from '@/db/schema';

/**
 * The athlete's own statements about their body (`training-architecture/06`).
 *
 * Slice 04 built the model and no way to speak to it; this is the way. Every
 * action resolves the athlete from the session — an id never arrives from the
 * client — and validates the closed sets here, before a feature module is
 * reached. Declaring or closing touches no session: the plan reacts to an
 * injury, it is never mutated by one (slice 04, asserted structurally).
 *
 * **The consent seam (ticket 14, parked).** `declareInjuryAction` and
 * `declareIllnessAction` are where the `injury_health_data` point-of-use
 * consent will be asked — once, before the first record is written, refusing to
 * write rather than writing and asking after. It is deliberately not built here
 * (Mads parked 14 post-test), and until it lands the standing rule holds: no
 * second real person uses the injury features.
 */
export type HealthActionResult =
  | { ok: true }
  | { ok: false; reason: 'not-authenticated' | 'invalid' };

export type HealthSubject = { injuryId: string } | { illnessId: string };

export async function declareInjuryAction(
  capacity: Capacity,
  bother?: number | null,
): Promise<HealthActionResult> {
  if (!isCapacity(capacity)) return { ok: false, reason: 'invalid' };
  const rating = parseBother(bother);
  if (rating === undefined) return { ok: false, reason: 'invalid' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  // ← ticket 14's consent gate goes here, before the write.
  await declareInjury(athleteId, capacity, rating);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function declareIllnessAction(bother?: number | null): Promise<HealthActionResult> {
  const rating = parseBother(bother);
  if (rating === undefined) return { ok: false, reason: 'invalid' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  // ← ticket 14's consent gate goes here, before the write.
  await declareIllness(athleteId, rating);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function closeInjuryAction(injuryId: string): Promise<HealthActionResult> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };
  await closeInjury(athleteId, injuryId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function closeIllnessAction(illnessId: string): Promise<HealthActionResult> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };
  await closeIllness(athleteId, illnessId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** The Bother Rating on an owned record; null clears it. */
export async function setBotherAction(
  subject: HealthSubject,
  bother: number | null,
): Promise<HealthActionResult> {
  if (!isSubject(subject)) return { ok: false, reason: 'invalid' };
  const rating = parseBother(bother);
  if (rating === undefined) return { ok: false, reason: 'invalid' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await setBother(athleteId, subject, rating);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * A note on the detail thread, as the athlete. For human eyes only: nothing
 * written here reaches a prompt (ADR 0011), which is why the field may be free
 * text at all.
 */
export async function addHealthNoteAction(
  subject: HealthSubject,
  body: string,
): Promise<HealthActionResult> {
  if (!isSubject(subject)) return { ok: false, reason: 'invalid' };
  const trimmed = body.trim();
  if (trimmed === '') return { ok: false, reason: 'invalid' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await addHealthNote(athleteId, subject, 'athlete', trimmed);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Exactly the three disciplines, each with a known allowance, and nothing else. */
function isCapacity(value: unknown): value is Capacity {
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  if (keys.length !== DISCIPLINES.length) return false;
  return DISCIPLINES.every((d) =>
    (ALLOWANCES as readonly string[]).includes((value as Record<string, unknown>)[d] as string),
  );
}

/**
 * `undefined` means invalid; `null` means the athlete did not say. Absent and
 * null both mean "did not say" — a rating is optional, and forcing one would
 * turn "how much is it bothering you" into a field to get past.
 */
function parseBother(value: unknown): Bother | undefined {
  if (value === undefined || value === null) return null;
  // `Number.isInteger` is false for every non-number, so no typeof is needed.
  const inRange = Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
  return inRange ? (value as number) : undefined;
}

function isSubject(value: unknown): value is HealthSubject {
  // Optional chaining guards null, undefined and primitives in one step.
  const v = value as { injuryId?: unknown; illnessId?: unknown } | null | undefined;
  const id = v?.injuryId ?? v?.illnessId;
  return typeof id === 'string' && id !== '';
}

/** The detail thread on one of the athlete's own records — theirs to read. */
export async function readHealthNotesAction(
  subject: HealthSubject,
): Promise<{ ok: true; notes: HealthNoteRow[] } | { ok: false; reason: 'not-authenticated' | 'invalid' }> {
  if (!isSubject(subject)) return { ok: false, reason: 'invalid' };
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };
  return { ok: true, notes: await getHealthNotes(athleteId, subject) };
}
