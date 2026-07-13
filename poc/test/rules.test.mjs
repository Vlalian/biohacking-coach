// Pure move rules — no storage, no DOM. The rule matrix is the spec:
// every legality and conflict cell is a table row here.
import { describe, it, expect } from 'vitest';
import { classifyMove, resolveDrop } from '../public/js/rules.js';

// Fixed reference dates: today is Wednesday 2026-07-15.
const TODAY      = '2026-07-15';
const THIS_MON   = '2026-07-13';
const THIS_TUE   = '2026-07-14';
const THIS_THU   = '2026-07-16';
const THIS_SAT   = '2026-07-18';
const THIS_SUN   = '2026-07-19';
const NEXT_MON   = '2026-07-20';
const LAST_WED   = '2026-07-08';
const LAST_MON   = '2026-07-06';

function session(overrides = {}) {
  return {
    id: 's_test', dateKey: THIS_THU, type: 'Endurance', origin: 'coach',
    status: 'planned', parked: false, isTraining: true, dayOrder: 1, feedback: null,
    ...overrides,
  };
}

describe('classifyMove — legality matrix', () => {
  const rows = [
    // [name, session overrides, target, expected]
    ['planned → future day same week: move',            {},                                        THIS_SAT, 'move'],
    ['planned → today: move',                           {},                                        TODAY,    'move'],
    ['planned on a past day of current week → future: move (revival drag)', { dateKey: THIS_TUE }, THIS_SAT, 'move'],
    ['skipped → future day same week: move',            { status: 'skipped' },                     THIS_SAT, 'move'],
    ['unavailable → future day same week: move',        { status: 'unavailable' },                 THIS_SAT, 'move'],
    ['Rest → future day same week: move',               { type: 'Rest', isTraining: false },       THIS_SAT, 'move'],
    ['completed: frozen',                               { status: 'completed' },                   THIS_SAT, 'frozen'],
    ['planned in a past week: frozen',                  { dateKey: LAST_WED },                     THIS_SAT, 'frozen'],
    ['skipped in a past week: frozen',                  { dateKey: LAST_MON, status: 'skipped' },  THIS_SAT, 'frozen'],
    ['target on a past day: bounce',                    {},                                        THIS_TUE, 'bounce'],
    ['target in the next week: bounce',                 {},                                        NEXT_MON, 'bounce'],
    ['target on the session\'s own day: bounce',        {},                                        THIS_THU, 'bounce'],
    ['Sunday is still this week: move',                 {},                                        THIS_SUN, 'move'],
    ['Monday of own week (past day): bounce',           {},                                        THIS_MON, 'bounce'],
  ];

  it.each(rows)('%s', (_name, overrides, target, expected) => {
    expect(classifyMove(session(overrides), target, TODAY)).toBe(expected);
  });

  it('cross-week bounce holds across a month boundary', () => {
    // Today Fri 2026-07-31; session Sat 2026-08-01 is in today's week;
    // target Mon 2026-08-03 is the next week.
    expect(classifyMove(session({ dateKey: '2026-08-01' }), '2026-08-03', '2026-07-31')).toBe('bounce');
    expect(classifyMove(session({ dateKey: '2026-08-01' }), '2026-08-02', '2026-07-31')).toBe('move');
  });
});

describe('resolveDrop — non-Rest conflict cells', () => {
  const training = t => session({ type: t });

  it('training onto an empty day places it planned', () => {
    const r = resolveDrop(training('Endurance'), []);
    expect(r).toMatchObject({ incomingStatus: 'planned', parkIncoming: false, displaceIds: [] });
  });

  it('training onto training places it (a Double, never a conflict)', () => {
    const r = resolveDrop(training('Endurance'), [session({ id: 'occupant', type: 'Intensity' })]);
    expect(r).toMatchObject({ incomingStatus: 'planned', parkIncoming: false, displaceIds: [] });
  });

  it('training onto several trainings still just places it', () => {
    const occupants = [session({ id: 'a' }), session({ id: 'b', type: 'Tempo' })];
    expect(resolveDrop(training('Recovery'), occupants).displaceIds).toEqual([]);
  });
});

describe('resolveDrop — Rest conflict cells (Displacement)', () => {
  const rest = () => session({ type: 'Rest', isTraining: false });

  it('Rest onto a training day displaces the training: parked in place, Rest lands active', () => {
    const r = resolveDrop(rest(), [session({ id: 'tr1', type: 'Endurance' })]);
    expect(r.incomingStatus).toBe('planned');
    expect(r.parkIncoming).toBe(false);
    expect(r.displaceIds).toEqual(['tr1']);
  });

  it('Rest onto a multi-occupant day parks every training session on it', () => {
    const occupants = [
      session({ id: 'a', type: 'Endurance' }),
      session({ id: 'b', type: 'Intensity', status: 'skipped' }),
    ];
    expect(resolveDrop(rest(), occupants).displaceIds).toEqual(['a', 'b']);
  });

  it('Rest never displaces a completed session — the record is immutable', () => {
    const occupants = [session({ id: 'done', status: 'completed' })];
    expect(resolveDrop(rest(), occupants).displaceIds).toEqual([]);
  });

  it('Rest onto Rest is a no-op — Rest days cannot be part of a Double', () => {
    const r = resolveDrop(rest(), [session({ id: 'r2', type: 'Rest', isTraining: false })]);
    expect(r.noop).toBe(true);
  });

  it('training onto a Rest day parks the incoming session; the Rest is untouched', () => {
    const r = resolveDrop(session(), [session({ id: 'r', type: 'Rest', isTraining: false })]);
    expect(r.parkIncoming).toBe(true);
    expect(r.incomingStatus).toBe('unavailable');
    expect(r.displaceIds).toEqual([]);
  });

  it('a non-load session coexists with Rest — no displacement, no parking', () => {
    const mobility = session({ type: 'Mobility', isTraining: false });
    const r = resolveDrop(mobility, [session({ id: 'r', type: 'Rest', isTraining: false })]);
    expect(r.parkIncoming).toBe(false);
    expect(r.incomingStatus).toBe('planned');
  });

  it('Rest onto a day holding a non-load session leaves it alone', () => {
    const occupants = [session({ id: 'mob', type: 'Mobility', isTraining: false })];
    expect(resolveDrop(rest(), occupants).displaceIds).toEqual([]);
  });
});
