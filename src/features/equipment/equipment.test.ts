import { describe, it, expect } from 'vitest';
import { isValidCategory, validateEquipmentDraft } from './equipment';

describe('isValidCategory', () => {
  it('accepts the fixed catalog', () => {
    expect(isValidCategory('bike')).toBe(true);
    expect(isValidCategory('shoes')).toBe(true);
    expect(isValidCategory('watch')).toBe(true);
    expect(isValidCategory('other')).toBe(true);
  });

  it('rejects anything outside the catalog', () => {
    expect(isValidCategory('skis')).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
  });
});

describe('validateEquipmentDraft', () => {
  it('trims and normalises a valid draft', () => {
    const result = validateEquipmentDraft({
      category: 'bike',
      name: '  Canyon Speedmax CF 7  ',
      details: '  size 54, tri setup  ',
    });

    expect(result).toEqual({
      ok: true,
      draft: { category: 'bike', name: 'Canyon Speedmax CF 7', details: 'size 54, tri setup' },
    });
  });

  it('turns empty details into null rather than an empty string', () => {
    const result = validateEquipmentDraft({ category: 'watch', name: 'Garmin 955', details: '   ' });

    expect(result).toEqual({ ok: true, draft: { category: 'watch', name: 'Garmin 955', details: null } });
  });

  it('refuses an invalid category', () => {
    expect(validateEquipmentDraft({ category: 'skis', name: 'Rossignol' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('refuses a blank name', () => {
    expect(validateEquipmentDraft({ category: 'other', name: '   ' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});
