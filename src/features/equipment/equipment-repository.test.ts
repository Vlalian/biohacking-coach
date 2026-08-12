import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderBy = vi.fn();
const limit = vi.fn();
const where = vi.fn(() => ({ orderBy, limit }));
const insertReturning = vi.fn();
const insertValues = vi.fn(() => ({ returning: insertReturning }));
const updateWhere = vi.fn(() => Promise.resolve());
const updateSet = vi.fn(() => ({ where: updateWhere }));
const deleteWhere = vi.fn(() => Promise.resolve());

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where }) }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere }),
  }),
}));

const {
  getEquipmentItems,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
} = await import('./equipment-repository');

const OWNER = 'athlete_owner';
const CREATED_AT = new Date('2026-08-01T12:00:00Z');

beforeEach(() => {
  orderBy.mockReset();
  limit.mockReset();
  where.mockClear();
  insertValues.mockClear();
  insertReturning.mockReset();
  updateSet.mockClear();
  updateWhere.mockClear();
  deleteWhere.mockClear();
});

describe('getEquipmentItems', () => {
  it("maps the athlete's rows to domain items, oldest first", async () => {
    orderBy.mockResolvedValue([
      { id: 'e1', category: 'bike', name: 'Canyon Speedmax', details: null, createdAt: CREATED_AT },
    ]);

    const items = await getEquipmentItems(OWNER);

    expect(items).toEqual([
      { id: 'e1', category: 'bike', name: 'Canyon Speedmax', details: null, addedDate: '2026-08-01' },
    ]);
  });
});

describe('createEquipmentItem', () => {
  it('creates a valid item', async () => {
    insertReturning.mockResolvedValue([
      { id: 'e2', category: 'shoes', name: 'Nike Vaporfly', details: 'size 44', createdAt: CREATED_AT },
    ]);

    const result = await createEquipmentItem({
      athleteId: OWNER,
      category: 'shoes',
      name: '  Nike Vaporfly  ',
      details: '  size 44  ',
    });

    expect(result).toEqual({
      ok: true,
      item: { id: 'e2', category: 'shoes', name: 'Nike Vaporfly', details: 'size 44', addedDate: '2026-08-01' },
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: OWNER, category: 'shoes', name: 'Nike Vaporfly', details: 'size 44' }),
    );
  });

  it('refuses an invalid category', async () => {
    const result = await createEquipmentItem({ athleteId: OWNER, category: 'skis', name: 'Rossignol' });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    const result = await createEquipmentItem({ athleteId: OWNER, category: 'watch', name: '   ' });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('updateEquipmentItem', () => {
  it("edits the athlete's own item", async () => {
    limit.mockResolvedValue([{ athleteId: OWNER }]);

    const result = await updateEquipmentItem({
      athleteId: OWNER,
      itemId: 'e1',
      category: 'bike',
      name: 'Updated name',
      details: null,
    });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'bike', name: 'Updated name', details: null }),
    );
  });

  it("refuses another athlete's item", async () => {
    limit.mockResolvedValue([{ athleteId: 'someone_else' }]);

    const result = await updateEquipmentItem({
      athleteId: OWNER,
      itemId: 'e1',
      category: 'bike',
      name: 'Nope',
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('returns not-found when the item does not exist', async () => {
    limit.mockResolvedValue([]);

    const result = await updateEquipmentItem({
      athleteId: OWNER,
      itemId: 'missing',
      category: 'bike',
      name: 'Nope',
    });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('refuses an invalid draft even for an owned item', async () => {
    limit.mockResolvedValue([{ athleteId: OWNER }]);

    const result = await updateEquipmentItem({
      athleteId: OWNER,
      itemId: 'e1',
      category: 'bike',
      name: '   ',
    });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe('deleteEquipmentItem', () => {
  it("deletes the athlete's own item", async () => {
    limit.mockResolvedValue([{ athleteId: OWNER }]);

    const result = await deleteEquipmentItem({ athleteId: OWNER, itemId: 'e1' });

    expect(result).toEqual({ ok: true });
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("refuses another athlete's item", async () => {
    limit.mockResolvedValue([{ athleteId: 'someone_else' }]);

    const result = await deleteEquipmentItem({ athleteId: OWNER, itemId: 'e1' });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('returns not-found when the item does not exist', async () => {
    limit.mockResolvedValue([]);

    const result = await deleteEquipmentItem({ athleteId: OWNER, itemId: 'missing' });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});
