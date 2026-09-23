import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveAthleteId,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  revalidatePath,
} = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  createEquipmentItem: vi.fn(),
  updateEquipmentItem: vi.fn(),
  deleteEquipmentItem: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/equipment/equipment-repository', () => ({
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
}));

const {
  createEquipmentItemAction,
  updateEquipmentItemAction,
  deleteEquipmentItemAction,
} = await import('./equipment-actions');

/**
 * Equipment feeds every Coach prompt, which is why a write here revalidates the
 * whole shell rather than one View — and why the ownership seam matters as much
 * as it does on a session: an item id is a claim the repository re-checks
 * against the athlete this action resolves.
 */
const ATHLETE = 'athlete_1';
const ITEM = { category: 'bike', name: 'Canyon Speedmax', details: null };

beforeEach(() => {
  resolveAthleteId.mockReset();
  createEquipmentItem.mockReset();
  updateEquipmentItem.mockReset();
  deleteEquipmentItem.mockReset();
  revalidatePath.mockClear();
});

describe('createEquipmentItemAction', () => {
  it('creates for the signed-in athlete and refreshes the shell', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    createEquipmentItem.mockResolvedValue({ ok: true, itemId: 'item_1' });

    const result = await createEquipmentItemAction(ITEM);

    expect(result).toEqual({ ok: true, itemId: 'item_1' });
    expect(createEquipmentItem).toHaveBeenCalledWith({ athleteId: ATHLETE, ...ITEM });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await createEquipmentItemAction(ITEM);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(createEquipmentItem).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refreshes nothing when the repository refuses the item', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    createEquipmentItem.mockResolvedValue({ ok: false, reason: 'invalid' });

    const result = await createEquipmentItemAction(ITEM);

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('updateEquipmentItemAction and deleteEquipmentItemAction', () => {
  it('pair the item id with the resolved athlete so ownership can be proven', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    updateEquipmentItem.mockResolvedValue({ ok: true });
    deleteEquipmentItem.mockResolvedValue({ ok: true });

    await updateEquipmentItemAction('item_1', ITEM);
    await deleteEquipmentItemAction('item_1');

    expect(updateEquipmentItem).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      itemId: 'item_1',
      ...ITEM,
    });
    expect(deleteEquipmentItem).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      itemId: 'item_1',
    });
    // Both writes refresh the whole shell, once each.
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, '/', 'layout');
    expect(revalidatePath).toHaveBeenNthCalledWith(2, '/', 'layout');
  });

  it('both refuse a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    await expect(updateEquipmentItemAction('item_1', ITEM)).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    await expect(deleteEquipmentItemAction('item_1')).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(updateEquipmentItem).not.toHaveBeenCalled();
    expect(deleteEquipmentItem).not.toHaveBeenCalled();
  });

  it('refreshes nothing when the write is refused', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    updateEquipmentItem.mockResolvedValue({ ok: false, reason: 'not-found' });
    deleteEquipmentItem.mockResolvedValue({ ok: false, reason: 'not-found' });

    await updateEquipmentItemAction('item_1', ITEM);
    await deleteEquipmentItemAction('item_1');

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
