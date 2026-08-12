/**
 * Equipment — the gear an athlete trains on (CONTEXT.md, via the Equipment
 * View: "the Coach can give more specific advice... the value is the Coach
 * knowing what the athlete trains on, not inventory management"). A list, not
 * a spec sheet: a couple of fields per item, any number of items.
 *
 * Framework-free — plain data in, plain data (or a validation verdict) out.
 * The repository is the only caller that touches Postgres; the Equipment
 * screen and the Coach's prompt builder both consume {@link EquipmentItem}.
 */

export const EQUIPMENT_CATEGORIES = ['bike', 'shoes', 'watch', 'other'] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

const NAME_MAX = 120;
const DETAILS_MAX = 500;

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  name: string;
  details: string | null;
  /** ISO date (YYYY-MM-DD) the item was added. */
  addedDate: string;
}

export interface EquipmentDraft {
  category: EquipmentCategory;
  name: string;
  details: string | null;
}

export function isValidCategory(value: unknown): value is EquipmentCategory {
  return typeof value === 'string' && (EQUIPMENT_CATEGORIES as readonly string[]).includes(value);
}

export type EquipmentDraftValidation =
  | { ok: true; draft: EquipmentDraft }
  | { ok: false; reason: 'invalid' };

/**
 * Validates and normalises a would-be Equipment item: a valid category, a
 * non-empty name (trimmed, length-capped), optional details (trimmed,
 * length-capped, empty becomes null rather than an empty string).
 */
export function validateEquipmentDraft(input: {
  category: unknown;
  name: unknown;
  details?: unknown;
}): EquipmentDraftValidation {
  if (!isValidCategory(input.category)) return { ok: false, reason: 'invalid' };
  if (typeof input.name !== 'string') return { ok: false, reason: 'invalid' };
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) return { ok: false, reason: 'invalid' };
  const details =
    typeof input.details === 'string' ? input.details.trim().slice(0, DETAILS_MAX) || null : null;
  return { ok: true, draft: { category: input.category, name, details } };
}
