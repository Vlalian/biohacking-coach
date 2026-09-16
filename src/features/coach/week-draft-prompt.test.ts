import { describe, it, expect } from 'vitest';
import { buildWeeklyContext, renderWeekDraftPrompt, renderWeeklyPrompt, stagedSessionLine, type WeekDraftContext } from './prompts';
import type { CheckIn } from './check-in';
import { WEEK_DRAFT_OPENER } from './week-draft';

/**
 * The silent week draft's prompt (`training-architecture/16`). Golden-pinned
 * like the Weekly Session's, plus the rules that matter: the skeleton is
 * presented as a default to adjust, retrieved science is numbered and cited
 * (or its absence is said), and the Coach is told to propose the whole window
 * in one call.
 */

const CHECK_IN: CheckIn = {
  readiness: { body: 6, energy: 7, sleepQuality: 5 },
  phase: 'Build the Volume',
  blockWeek: 'week 3 of 8',
  commStyle: '',
  experienceLevel: 'intermediate',
  sessionCount: 4,
  language: 'en',
  weeklySessionDay: 'Wednesday',
  fixedConstraints: ['Thursday'],
  equipment: [],
  raceTarget: 'Ironman Copenhagen',
  raceDistance: 'Ironman',
  raceDate: '2027-08-15',
  notableSignal: 'calf a bit tight after Sunday',
};

const TODAY = '2026-09-16';

function ctx(over: Partial<WeekDraftContext> = {}): WeekDraftContext {
  return {
    ...buildWeeklyContext(
      CHECK_IN,
      [{ dateKey: '2026-09-13', sessionType: 'Endurance', body: 7, mind: 8 }],
      [],
      [],
      ['2026-09-26'],
      null,
      TODAY,
    ),
    window: { start: '2026-09-21', end: '2026-09-27', excludedDates: ['2026-09-24', '2026-09-26'], fellThrough: false },
    skeleton: [
      { date: '2026-09-21', role: 'easy' },
      { date: '2026-09-22', role: 'easy' },
      { date: '2026-09-23', role: 'hard' },
      { date: '2026-09-24', role: 'rest' },
      { date: '2026-09-25', role: 'easy' },
      { date: '2026-09-26', role: 'rest' },
      { date: '2026-09-27', role: 'long' },
    ],
    passages: [
      { text: 'Polarised distribution: most volume easy, a small hard fraction.', similarity: 0.71, ordinal: 3, sourceId: 's1' },
      { text: 'Long sessions on consecutive days raise injury risk.', similarity: 0.66, ordinal: 9, sourceId: 's2' },
    ],
    citations: [
      { sourceId: 's1', slug: 'seiler-2010', title: 'What is best practice for training intensity?', authors: 'Seiler', year: 2010, url: null, licence: 'CC BY', licenceUrl: '', attribution: 'Seiler (2010)', ordinals: [3] },
      { sourceId: 's2', slug: 'nielsen-2014', title: 'Running-related injuries', authors: 'Nielsen et al.', year: 2014, url: null, licence: 'CC BY', licenceUrl: '', attribution: 'Nielsen et al. (2014)', ordinals: [9] },
    ],
    ...over,
  };
}

describe('renderWeekDraftPrompt', () => {
  it('renders identically for the same context (golden)', () => {
    expect(renderWeekDraftPrompt(ctx())).toMatchSnapshot();
  });

  it('presents the skeleton as a default to adjust, one dated line per day', () => {
    const out = renderWeekDraftPrompt(ctx());
    expect(out).toContain('WEEK SKELETON');
    expect(out).toContain('2026-09-23: hard');
    expect(out).toContain('2026-09-27: long');
    expect(out).toContain('2026-09-24: rest');
    expect(out).toMatch(/adjust this skeleton/i);
    expect(out).toMatch(/keep the rest day and the long\/hard spacing/i);
  });

  it('carries the window, the block and position, the check-in and the reflections', () => {
    const out = renderWeekDraftPrompt(ctx());
    expect(out).toContain('WEEK WINDOW: 2026-09-21 to 2026-09-27');
    expect(out).toContain('Build the Volume, week 3 of 8');
    expect(out).toContain('calf a bit tight after Sunday');
    expect(out).toContain('LAST WEEK FEEDBACK');
  });

  it('numbers the retrieved passages and names their sources', () => {
    const out = renderWeekDraftPrompt(ctx());
    expect(out).toContain('TRAINING SCIENCE');
    expect(out).toContain('[1] Polarised distribution');
    expect(out).toContain('[2] Long sessions on consecutive days');
    expect(out).toContain('Seiler (2010)');
    expect(out).not.toContain('No sources were retrieved');
  });

  it('says so when nothing was retrieved, and forbids asserting a claim', () => {
    const out = renderWeekDraftPrompt(ctx({ passages: [], citations: [] }));
    expect(out).toContain('No sources were retrieved for this week');
    expect(out).toMatch(/do not assert a training-science claim/i);
    expect(out).not.toContain('[1]');
  });

  it('tells the Coach to propose the whole window in one call and omit rest days', () => {
    const out = renderWeekDraftPrompt(ctx());
    expect(out).toMatch(/propose_week_plan/);
    expect(out).toMatch(/once/i);
    expect(out).toMatch(/whole window|entire window/i);
    expect(out).toMatch(/omit rest days/i);
  });

  it('refuses a context carrying a direct identifier', () => {
    expect(() =>
      renderWeekDraftPrompt(ctx({ checkIn: { ...CHECK_IN, notableSignal: 'mail me at anna@example.com' } })),
    ).toThrow();
  });

  it('the opener is a fixed user turn', () => {
    expect(WEEK_DRAFT_OPENER).toBe("Draft next week's plan.");
  });
});

describe('renderWeekDraftPrompt — the window block, line by line', () => {
  it('lists the excluded days and the recurring no-train days only when there are any', () => {
    const full = renderWeekDraftPrompt(ctx());
    expect(full).toContain('TODAY: 2026-09-16\nWEEK WINDOW: 2026-09-21 to 2026-09-27\nNO TRAINING ON: 2026-09-24, 2026-09-26\nRECURRING NO-TRAIN DAYS: Thursday');

    const bare = renderWeekDraftPrompt(
      ctx({
        checkIn: { ...CHECK_IN, fixedConstraints: [] },
        window: { start: '2026-09-21', end: '2026-09-27', excludedDates: [], fellThrough: false },
      }),
    );
    expect(bare).toContain('TODAY: 2026-09-16\nWEEK WINDOW: 2026-09-21 to 2026-09-27\n\n');
    expect(bare).not.toContain('NO TRAINING ON');
    expect(bare).not.toContain('RECURRING NO-TRAIN DAYS');

    const fixedOnly = renderWeekDraftPrompt(
      ctx({ window: { start: '2026-09-21', end: '2026-09-27', excludedDates: [], fellThrough: false } }),
    );
    expect(fixedOnly).toContain('WEEK WINDOW: 2026-09-21 to 2026-09-27\nRECURRING NO-TRAIN DAYS: Thursday');
    expect(fixedOnly).not.toContain('NO TRAINING ON');
  });

  it('names a passage whose source is missing from the citations as unknown rather than dropping it', () => {
    const out = renderWeekDraftPrompt(ctx({ citations: [] }));
    expect(out).toContain('[1] Polarised distribution: most volume easy, a small hard fraction. — source unknown');
  });
});

describe('the Weekly Session prompt with a week brought in from the calendar (training-architecture/18)', () => {
  const weekly = (staged?: WeekDraftContext['checkIn'] extends never ? never : Parameters<typeof renderWeeklyPrompt>[0]['stagedProposal']) =>
    renderWeeklyPrompt({ ...buildWeeklyContext({ ...CHECK_IN, weeklySessionNumber: 4 }, [], [], [], [], null, TODAY), stagedProposal: staged });

  it('carries the PROPOSED WEEK block only when a proposal is staged, and not for an empty list', () => {
    expect(weekly(undefined)).not.toContain('PROPOSED WEEK');
    expect(weekly([])).not.toContain('PROPOSED WEEK');
    const out = weekly([{ date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy spin' }]);
    expect(out).toContain('PROPOSED WEEK (drafted for the athlete, already shown to them as a proposal');
    expect(out).toContain('2026-09-22: Endurance 60min Z2 — easy spin');
    expect(out).toContain('tell them to confirm the proposal they already have');
  });

  it('renders each staged session with only the parts it has', () => {
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy spin' })).toBe('2026-09-22: Endurance 60min Z2 — easy spin');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Endurance', durationMinutes: null, zone: null, note: null })).toBe('2026-09-22: Endurance');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Recovery', durationMinutes: 30, zone: null, note: null })).toBe('2026-09-22: Recovery 30min');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Tempo', durationMinutes: null, zone: 'Z3', note: null })).toBe('2026-09-22: Tempo Z3');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Tempo', durationMinutes: null, zone: null, note: 'steady' })).toBe('2026-09-22: Tempo — steady');
  });
});
