'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId, type AuthFailure } from '../../current-athlete';
import {
  createEquipmentItem,
  deleteEquipmentItem,
  updateEquipmentItem,
  type CreateEquipmentItemResult,
  type EquipmentItemWriteResult,
} from '@/features/equipment/equipment-repository';

/**
 * Server actions for the Equipment screen. Each resolves the acting athlete
 * from the authenticated session — never from the request — mirroring
 * session-actions.ts. Equipment also feeds every Coach prompt, so a write
 * here revalidates the whole shell, same as a session change.
 */

export async function createEquipmentItemAction(input: {
  category: string;
  name: string;
  details: string | null;
}): Promise<CreateEquipmentItemResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await createEquipmentItem({ athleteId, ...input });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateEquipmentItemAction(
  itemId: string,
  input: { category: string; name: string; details: string | null },
): Promise<EquipmentItemWriteResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await updateEquipmentItem({ athleteId, itemId, ...input });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function deleteEquipmentItemAction(
  itemId: string,
): Promise<EquipmentItemWriteResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await deleteEquipmentItem({ athleteId, itemId });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
