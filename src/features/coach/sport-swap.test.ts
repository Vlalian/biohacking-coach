import { describe, it, expect } from 'vitest';
import { withSwaps } from './sport-swap';

const KNEE = { date: '2026-09-30', from: 'run', to: 'bike', reason: 'knæ' } as const;
const SWIM = { date: '2026-10-04', from: 'bike', to: 'swim', reason: 'the bike is in for repair' } as const;

describe('withSwaps — the explained sport swaps after what changed', () => {
  it('names each swap by weekday and sport in Danish, with the reason as it was written', () => {
    expect(withSwaps(null, [KNEE], 'da')).toBe('Onsdag: løb → cykel (knæ)');
    expect(withSwaps('Lettede løbet.', [KNEE, { ...SWIM, from: 'brick' }], 'da')).toBe(
      'Lettede løbet. Onsdag: løb → cykel (knæ); Søndag: brick-session → svøm (the bike is in for repair)',
    );
  });

  it('names them in English for an English athlete, and for one whose language was never set', () => {
    expect(withSwaps('Eased the long ride.', [KNEE], 'en')).toBe('Eased the long ride. Wednesday: run → bike (knæ)');
    expect(withSwaps(null, [KNEE, SWIM], null)).toBe('Wednesday: run → bike (knæ); Sunday: bike → swim (the bike is in for repair)');
  });

  it('reads a date key as its calendar day, whatever the clock’s zone', () => {
    // Monday and Saturday: the first and the last day of the week the server can get wrong.
    expect(withSwaps(null, [{ ...KNEE, date: '2026-09-28' }, { ...KNEE, date: '2026-10-03' }], 'en')).toBe(
      'Monday: run → bike (knæ); Saturday: run → bike (knæ)',
    );
    expect(withSwaps(null, [{ ...KNEE, date: '2026-09-29' }, { ...KNEE, date: '2026-10-01' }, { ...KNEE, date: '2026-10-02' }], 'da')).toBe(
      'Tirsdag: løb → cykel (knæ); Torsdag: løb → cykel (knæ); Fredag: løb → cykel (knæ)',
    );
  });

  it('leaves what changed alone when there are no swaps', () => {
    expect(withSwaps('Same week.', [], 'da')).toBe('Same week.');
    expect(withSwaps(null, [], 'en')).toBeNull();
  });
});
