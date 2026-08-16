import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { equipmentItems } from '@/db/schema';
import { dateKey } from '@/lib/date';
import { validateEquipmentDraft, type EquipmentItem } from './equipment';

/**
 * The Equipment repository — the only module that touches the
 * `equipment_items` table. Every read and write is scoped to one athlete id
 * resolved from the authenticated session upstream (ADR 0006); a
 * client-supplied item id is checked against that owner, never trusted.
 */

function toEquipmentItem(row: {
  id: string;
  category: string;
  name: string;
  details: string | null;
  createdAt: Date;
}): EquipmentItem {
  return {
    id: row.id,
    category: row.category as EquipmentItem['category'],
    name: row.name,
    details: row.details,
    addedDate: dateKey(row.createdAt),
  };
}

/** The athlete's equipment, oldest first — the order the screen groups by category within. */
export async function getEquipmentItems(athleteId: string): Promise<EquipmentItem[]> {
  const rows = await getDb()
    .select({
      id: equipmentItems.id,
      category: equipmentItems.category,
      name: equipmentItems.name,
      details: equipmentItems.details,
      createdAt: equipmentItems.createdAt,
    })
    .from(equipmentItems)
    .where(eq(equipmentItems.athleteId, athleteId))
    .orderBy(asc(equipmentItems.createdAt));

  return rows.map(toEquipmentItem);
}

export type CreateEquipmentItemResult =
  | { ok: true; item: EquipmentItem }
  | { ok: false; reason: 'invalid' | 'identifier' };

export async function createEquipmentItem(params: {
  athleteId: string;
  category: unknown;
  name: unknown;
  details?: unknown;
}): Promise<CreateEquipmentItemResult> {
  const validated = validateEquipmentDraft(params);
  if (!validated.ok) return validated;

  const [row] = await getDb()
    .insert(equipmentItems)
    .values({ athleteId: params.athleteId, ...validated.draft })
    .returning({
      id: equipmentItems.id,
      category: equipmentItems.category,
      name: equipmentItems.name,
      details: equipmentItems.details,
      createdAt: equipmentItems.createdAt,
    });

  return { ok: true, item: toEquipmentItem(row) };
}

export type EquipmentItemWriteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid' | 'identifier' };

async function loadOwnedEquipmentItem(itemId: string, athleteId: string) {
  const [row] = await getDb()
    .select({ athleteId: equipmentItems.athleteId })
    .from(equipmentItems)
    .where(eq(equipmentItems.id, itemId))
    .limit(1);

  if (!row) return { ok: false as const, reason: 'not-found' as const };
  if (row.athleteId !== athleteId) return { ok: false as const, reason: 'not-owner' as const };
  return { ok: true as const };
}

export async function updateEquipmentItem(params: {
  athleteId: string;
  itemId: string;
  category: unknown;
  name: unknown;
  details?: unknown;
}): Promise<EquipmentItemWriteResult> {
  const found = await loadOwnedEquipmentItem(params.itemId, params.athleteId);
  if (!found.ok) return found;

  const validated = validateEquipmentDraft(params);
  if (!validated.ok) return validated;

  await getDb()
    .update(equipmentItems)
    .set(validated.draft)
    .where(and(eq(equipmentItems.id, params.itemId), eq(equipmentItems.athleteId, params.athleteId)));

  return { ok: true };
}

export async function deleteEquipmentItem(params: {
  athleteId: string;
  itemId: string;
}): Promise<EquipmentItemWriteResult> {
  const found = await loadOwnedEquipmentItem(params.itemId, params.athleteId);
  if (!found.ok) return found;

  await getDb()
    .delete(equipmentItems)
    .where(and(eq(equipmentItems.id, params.itemId), eq(equipmentItems.athleteId, params.athleteId)));

  return { ok: true };
}
