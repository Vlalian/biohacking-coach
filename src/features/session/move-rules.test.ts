import { describe, it, expect } from 'vitest';
import { classifyMove, type MoveCandidate } from './move-rules';

// The rule matrix is the spec: every legality cell is a row here. Ported from
// the POC's rules.test.mjs. Fixed reference: today is Wednesday 2026-07-15.
const TODAY = '2026-07-15';
const THIS_MON = '2026-07-13';
const THIS_TUE = '2026-07-14';
const THIS_THU = '2026-07-16';
const THIS_SAT = '2026-07-18';
const THIS_SUN = '2026-07-19';
const NEXT_MON = '2026-07-20';
const LAST_WED = '2026-07-08';
const LAST_MON = '2026-07-06';

function session(overrides: Partial<MoveCandidate> = {}): MoveCandidate {
  return { date: THIS_THU, status: 'planned', ...overrides };
}

describe('classifyMove — legality matrix', () => {
  const rows: Array<[string, Partial<MoveCandidate>, string, string]> = [
    ['planned → future day same week: move', {}, THIS_SAT, 'move'],
    ['planned → today: move', {}, TODAY, 'move'],
    ['planned on a past day of current week → future: move (revival drag)', { date: THIS_TUE }, THIS_SAT, 'move'],
    ['skipped → future day same week: move', { status: 'skipped' }, THIS_SAT, 'move'],
    ['unavailable → future day same week: move', { status: 'unavailable' }, THIS_SAT, 'move'],
    ['Rest → future day same week: move', {}, THIS_SAT, 'move'],
    ['completed: frozen', { status: 'completed' }, THIS_SAT, 'frozen'],
    ['planned in a past week: frozen', { date: LAST_WED }, THIS_SAT, 'frozen'],
    ['skipped in a past week: frozen', { date: LAST_MON, status: 'skipped' }, THIS_SAT, 'frozen'],
    ['target on a past day: bounce', {}, THIS_TUE, 'bounce'],
    ['target in the next week: bounce', {}, NEXT_MON, 'bounce'],
    ["target on the session's own day: bounce", {}, THIS_THU, 'bounce'],
    ['Sunday is still this week: move', {}, THIS_SUN, 'move'],
    ['Monday of own week (past day): bounce', {}, THIS_MON, 'bounce'],
  ];

  it.each(rows)('%s', (_name, overrides, target, expected) => {
    expect(classifyMove(session(overrides), target, TODAY)).toBe(expected);
  });

  it('cross-week bounce holds across a month boundary', () => {
    // Today Fri 2026-07-31; session Sat 2026-08-01 is in today's week; target
    // Mon 2026-08-03 is next week, target Sun 2026-08-02 is still this week.
    expect(classifyMove(session({ date: '2026-08-01' }), '2026-08-03', '2026-07-31')).toBe('bounce');
    expect(classifyMove(session({ date: '2026-08-01' }), '2026-08-02', '2026-07-31')).toBe('move');
  });
});
