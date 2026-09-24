import { describe, it, expect } from 'vitest';
import { buildChatPrompt, buildWeeklyContext, renderWeekDraftPrompt, stagedSessionLine, type WeekDraftContext } from './prompts';
import type { ProposedSession } from './weekly-session';
import type { CheckIn } from './check-in';
import { WEEK_DRAFT_OPENER } from './week-draft';

/**
 * The silent week draft's prompt (`training-architecture/16`). Golden-pinned,
 * plus the rules that matter: the skeleton is
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
  presenceStage: 'full',
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
      ['2026-09-26'],
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

// The blocks the Weekly Session's prompt used to share with the draft — STATE,
// DATA USE, LAST WEEK FEEDBACK, UNAVAILABLE — are the draft's alone since the
// session was retired (`training-architecture/21`), so their branches are
// pinned here, where they are still rendered.
describe('renderWeekDraftPrompt — the blocks it inherited, branch by branch', () => {
  const draft = (checkIn: Partial<WeekDraftContext['checkIn']> = {}, over: Partial<WeekDraftContext> = {}) =>
    renderWeekDraftPrompt(ctx({ checkIn: { ...CHECK_IN, ...checkIn }, ...over }));

  it('STATE: drops a tag whose value is absent, keeps the xp default, and reads the scores as given', () => {
    const full = draft();
    expect(full).toContain('STATE: phase=Build the Volume presence=full body=6/10 energy=7/10 sleep-quality=5/10 xp=intermediate');
    const bare = draft({ phase: undefined, presenceStage: undefined, experienceLevel: '', readiness: undefined });
    expect(bare).toContain('\nSTATE: xp=intermediate\n');
    expect(bare).not.toContain('undefined');
    expect(draft({ experienceLevel: 'advanced' })).toContain('xp=advanced');
  });

  it('DATA USE: reads scores when there is a Check-in, and only Session Reflections when there is none', () => {
    expect(draft()).toContain('DATA USE: Scores = coaching intelligence, never cite directly.\nLow body/energy/mental → soften load.');
    expect(draft()).not.toContain('is your only read on those');
    const none = draft({ readiness: undefined });
    expect(none).toContain('DATA USE: Session Reflections = coaching intelligence, never cite directly.\nStrong feedback → validate. Mixed → name inconsistency. What the athlete tells you in words about body, sleep and energy is your only read on those — weigh it as such.');
    expect(none).not.toContain('Low body/energy/mental');
  });

  it('LAST WEEK FEEDBACK: the reflections when there are any, else one of two honest absences', () => {
    expect(draft()).toContain('LAST WEEK FEEDBACK:\n- Sun 13 Sept · Endurance · Body 🙂 (7/10) · Mind 🙂 (8/10)');
    const noFeedback = { feedbackSummary: null };
    expect(draft({}, noFeedback)).toContain('No feedback this week — use check-in signals and self-assessment.');
    expect(draft({ readiness: undefined }, noFeedback)).toContain('No feedback this week, and no check-in data — go on what the athlete tells you.');
    expect(draft({ readiness: undefined }, noFeedback)).not.toContain('use check-in signals');
  });

  it('UNAVAILABLE: the dates on one line, or nothing at all', () => {
    expect(draft({}, { unavailableDates: ['2026-09-22', '2026-09-25'] })).toContain(
      "UNAVAILABLE: 2026-09-22, 2026-09-25 — no sessions, don't mention unless athlete raises it.",
    );
    expect(draft({}, { unavailableDates: [] })).not.toContain('UNAVAILABLE');
  });

  it('RECURRING NO-TRAIN DAYS: several, comma separated', () => {
    expect(draft({ fixedConstraints: ['Monday', 'Thursday'] })).toContain('RECURRING NO-TRAIN DAYS: Monday, Thursday');
  });

  it('names tune-ups, late races and the window beneath HORIZON, the same lines as the chat', () => {
    const olympic = { name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic' };
    const out = draft({ tuneUps: [olympic], lateRaces: [olympic], tuneUpWindow: { from: '2026-12-01', to: '2027-02-10' }, tuneUpEveEasy: true });
    expect(out).toContain('TUNE-UPS: Olympic Odense on 2027-03-01 (Olympic) — ordinary training day, do not taper — keep the day before easy');
    expect(out).toContain('LATE RACE: Olympic Odense on 2027-03-01 (Olympic)');
    expect(out).toContain('TUNE-UP WINDOW: now (2026-12-01–2027-02-10)');
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

describe('the one conversation with a week brought in from the calendar (training-architecture/18, into Coach Chat since /20)', () => {
  const window = { start: '2026-09-21', end: '2026-09-27', excludedDates: [], fellThrough: false };
  const weekly = (staged: ProposedSession[] | null) =>
    buildChatPrompt(CHECK_IN, TODAY, null, [], { window, stagedProposal: staged });

  it('carries the PROPOSED WEEK block only when a proposal is staged, and not for an empty list', () => {
    expect(weekly(null)).not.toContain('PROPOSED WEEK');
    expect(weekly([])).not.toContain('PROPOSED WEEK');
    const out = weekly([{ date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy spin' }]);
    expect(out).toContain('PROPOSED WEEK (drafted for the athlete, already shown to them as a proposal');
    expect(out).toContain('2026-09-22: Endurance 60min Z2 — easy spin');
    expect(out).toContain('tell them to confirm the proposal they already have');
  });

  it('refuses a staged session whose note carries an identifier — the prompt boundary asserts on it like every other input', () => {
    // The notes reaching here are the Coach's own after approval strips the
    // coach's, but the builder is the boundary and asserts regardless
    // (CodeRabbit, PR #69). Email and phone shapes only; names are the
    // origin guard's job.
    expect(() => weekly([{ date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: null, note: 'ask mads@example.com' }])).toThrow(/identifier/);
  });

  it('renders each staged session with only the parts it has', () => {
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy spin' })).toBe('2026-09-22: Endurance 60min Z2 — easy spin');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Endurance', durationMinutes: null, zone: null, note: null })).toBe('2026-09-22: Endurance');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Recovery', durationMinutes: 30, zone: null, note: null })).toBe('2026-09-22: Recovery 30min');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Tempo', durationMinutes: null, zone: 'Z3', note: null })).toBe('2026-09-22: Tempo Z3');
    expect(stagedSessionLine({ date: '2026-09-22', type: 'Tempo', durationMinutes: null, zone: null, note: 'steady' })).toBe('2026-09-22: Tempo — steady');
  });
});

describe('the baseline week — what the structure already wrote (training-architecture/34)', () => {
  const baseline = [
    { date: '2026-09-21', sport: 'swim' as const, type: 'Endurance' as const, durationMinutes: 66, zone: 'Z2', title: 'Easy swim', note: null },
    { date: '2026-09-27', sport: 'bike' as const, type: 'Endurance' as const, durationMinutes: 144, zone: 'Z2', title: 'Long ride', note: null },
  ];

  it('replaces the role skeleton with the real sessions when there are some', () => {
    const out = renderWeekDraftPrompt(ctx({ baseline }));
    expect(out).toContain('BASELINE WEEK');
    expect(out).toContain('2026-09-27: bike Endurance 144 min Z2 — Long ride');
    expect(out).toContain('2026-09-21: swim Endurance 66 min Z2 — Easy swim');
    // One or the other, never both: two defaults would be two instructions.
    expect(out).not.toContain('WEEK SKELETON');
    expect(out).not.toContain('Adjust this skeleton');
  });

  it('puts one session per line, and leaves out a duration or a zone the row does not carry', () => {
    const out = renderWeekDraftPrompt(
      ctx({
        baseline: [
          ...baseline,
          { date: '2026-09-24', sport: 'run', type: 'Endurance', durationMinutes: null, zone: null, title: 'Easy run' },
        ],
      }),
    );
    // Each session on its own line: run together they read as one session.
    const lines = out.split('\n');
    expect(lines).toContain('2026-09-24: run Endurance — Easy run');
    expect(lines).toContain('2026-09-21: swim Endurance 66 min Z2 — Easy swim');
  });

  it('falls back to the skeleton when the structure wrote nothing for this week', () => {
    for (const value of [null, []]) {
      const out = renderWeekDraftPrompt(ctx({ baseline: value }));
      expect(out).toContain('WEEK SKELETON');
      expect(out).not.toContain('BASELINE WEEK');
    }
  });
});

describe('the four weeks before the drafted one (training-architecture/44)', () => {
  const SUMMARY = [
    { weekStart: '2026-08-24', plannedMinutes: 0, doneMinutes: 0, completed: 0, skipped: 0, byType: [] },
    { weekStart: '2026-08-31', plannedMinutes: 300, doneMinutes: 240, completed: 4, skipped: 1, byType: [{ type: 'Endurance', completed: 3, doneMinutes: 180 }, { type: 'Intensity', completed: 1, doneMinutes: 60 }] },
    { weekStart: '2026-09-07', plannedMinutes: 280, doneMinutes: 0, completed: 0, skipped: 4, byType: [] },
    { weekStart: '2026-09-14', plannedMinutes: 90, doneMinutes: 90, completed: 1, skipped: 0, byType: [{ type: 'Endurance', completed: 1, doneMinutes: 90 }] },
  ];

  it('carries the last four weeks', () => {
    expect(renderWeekDraftPrompt(ctx({ recentWeeks: SUMMARY }))).toMatchSnapshot();
  });

  it('adds nothing when there is no history to read', () => {
    expect(renderWeekDraftPrompt(ctx({ recentWeeks: [] }))).toBe(renderWeekDraftPrompt(ctx()));
  });

  it('refuses a summary carrying a direct identifier, like every other input', () => {
    const leaked = [{ ...SUMMARY[3], byType: [{ type: 'anna@example.com', completed: 1, doneMinutes: 90 }] }];
    expect(() => renderWeekDraftPrompt(ctx({ recentWeeks: leaked }))).toThrow();
  });
});
