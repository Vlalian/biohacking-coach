import { describe, it, expect } from 'vitest';
import { NO_WRITES, beginCreate } from './calendar-writes';

/** `showable-version/52` — the placeholder a new athlete session shows before the server's row. */
const DRAFT = { date: '2026-07-17', type: 'Strength', duration: 45, isTraining: true, note: null };

describe('beginCreate and the sport', () => {
  it('shows no sport as null, whether the draft leaves it out or says null', () => {
    const left = beginCreate(NO_WRITES, [], 'tmp:1', DRAFT, '2026-07-15').inFlight['tmp:1'];
    expect(left?.sport).toBeNull();
    const said = beginCreate(NO_WRITES, [], 'tmp:2', { ...DRAFT, sport: null }, '2026-07-15').inFlight['tmp:2'];
    expect(said?.sport).toBeNull();
  });

  it('shows each sport the draft names, whatever the day', () => {
    for (const sport of ['swim', 'bike', 'run', 'brick', 'strength', 'mobility', 'misc']) {
      const row = beginCreate(NO_WRITES, [], 'tmp:1', { ...DRAFT, sport }, '2026-07-15').inFlight['tmp:1'];
      expect(row?.sport).toBe(sport);
    }
  });
});
