import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/features/equipment/equipment';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/use-dialog-focus', () => ({ useDialogFocus: () => ({ current: null }) }));
vi.mock('./equipment-actions', () => ({
  createEquipmentItemAction: vi.fn(),
  updateEquipmentItemAction: vi.fn(),
  deleteEquipmentItemAction: vi.fn(),
}));

const { EquipmentForm } = await import('./equipment-view');

// The key itself, so the assertion names which hint rendered.
const t = ((key: string) => key) as unknown as Parameters<typeof EquipmentForm>[0]['t'];

function formFor(category: EquipmentCategory) {
  const item = { id: 'e1', category, name: '', details: null, addedDate: '2026-09-25' };
  return renderToStaticMarkup(
    <EquipmentForm t={t} item={item} pending={false} onCancel={() => {}} onSubmit={() => {}} />,
  );
}

describe('EquipmentForm — the name hint (showable-version/49)', () => {
  it.each(EQUIPMENT_CATEGORIES)('shows the %s example in the name field', (category) => {
    expect(formFor(category)).toContain(`placeholder="namePlaceholder_${category}"`);
  });

  it('has a hint in the catalogue for every category, in both languages', async () => {
    // `t` above returns the key, so the tests above pass whether or not the
    // message exists. A category added without its hint would show the raw key.
    for (const locale of ['en', 'da'] as const) {
      const catalogue = (await import(`@/messages/${locale}.json`)).default.Equipment;
      for (const category of EQUIPMENT_CATEGORIES) {
        expect(Object.keys(catalogue), `${locale}: namePlaceholder_${category}`).toContain(
          `namePlaceholder_${category}`,
        );
      }
    }
  });

  it('never shows the bike example for another category', () => {
    for (const category of EQUIPMENT_CATEGORIES.filter((c) => c !== 'bike')) {
      expect(formFor(category)).not.toContain('namePlaceholder_bike');
    }
  });
});
