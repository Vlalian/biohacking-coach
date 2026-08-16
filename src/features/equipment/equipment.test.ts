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

  // Both fields reach the Coach prompts through `buildEquipmentLines`, so a
  // shaped identifier is refused at the write rather than stored and then
  // throwing on the athlete's next Coach message.
  it('refuses an email in the name', () => {
    expect(validateEquipmentDraft({ category: 'bike', name: 'Canyon — mads@example.com' })).toEqual(
      { ok: false, reason: 'identifier' },
    );
  });

  it('refuses a phone number in the details', () => {
    expect(
      validateEquipmentDraft({
        category: 'bike',
        name: 'Canyon Speedmax',
        details: 'shop on +45 20 12 34 56',
      }),
    ).toEqual({ ok: false, reason: 'identifier' });
  });

  it('leaves ordinary gear text alone', () => {
    // The guard must not eat real equipment names — model numbers and years are
    // exactly the digits an over-eager pattern would swallow.
    for (const name of ['Canyon Speedmax CF SLX 8', 'Garmin Forerunner 955', 'Zoom Fly 5']) {
      expect(validateEquipmentDraft({ category: 'other', name })).toMatchObject({ ok: true });
    }
  });
});
