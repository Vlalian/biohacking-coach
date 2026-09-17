import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  buildWeeklyContext,
  renderWeeklyPrompt,
  buildChatPrompt,
  formatWeekSessions,
  formatSkippedSessions,
  formatWeekActivity,
  formatWeekFeedback,
} from './prompts';
import type { CheckIn, Onboarding } from './check-in';
import type { WeekSession } from './week';
import { READINESS_SCORE_TOKENS } from '@/test/readiness-tokens';

const BASE: CheckIn = {
  readiness: { body: 7, energy: 7, sleepQuality: 7, mental: 7, sleepHours: 7, restingPulse: 50 },
  phase: 'Base Building',
  personaName: 'Mads',
  commStyle: '',
  experienceLevel: 'intermediate',
  sessionCount: 5,
  language: 'English',
  weeklySessionDay: 'Monday',
  fixedConstraints: [],
  equipment: [],
};

describe('no real identity reaches a prompt (slice 15, GDPR decision 1)', () => {
  // The load-bearing criterion: the consent artifact tells the coach that no
  // name reaches Anthropic. If a name can appear in a rendered prompt, that
  // sentence is a lie. `personaName` is deliberately no longer interpolated —
  // even set to a real-looking name, it must not surface.
  const NAME = 'Jane Q Realname';
  const EMAIL = 'jane.realname@example.com';
  const withIdentity: CheckIn = {
    ...BASE,
    personaName: NAME,
    raceTarget: 'Ironman Copenhagen',
    experienceLevel: 'veteran',
  };

  it('the Coach Chat prompt carries no name or email', () => {
    const prompt = buildChatPrompt(withIdentity, '2026-08-12');
    expect(prompt).not.toContain(NAME);
    expect(prompt).not.toContain('Realname');
    expect(prompt).not.toContain(EMAIL);
  });

  // The Coach Overlay's Reference ("Discuss with Coach") passes a Session into
  // the prompt as a *separate* argument, so it bypasses the check-in assertion
  // that guards everything else. Its `note` is athlete/Coach free text — the
  // realistic hiding place for an identifier — so the prompt builders assert it
  // themselves. Caught by code review; these two tests are what keep it shut.
  const leakySession = {
    type: 'Endurance',
    dayLabel: '2026-08-18',
    duration: '90 min',
    zone: 'Z2',
    note: `ride with me, reach me at ${EMAIL}`,
    status: 'planned',
  };

  it('refuses a Reference whose note carries an email — Coach Chat', () => {
    expect(() => buildChatPrompt(BASE, '2026-08-12', leakySession)).toThrow(/identifier/i);
  });

  // Equipment `name` and `details` are athlete free text that `buildEquipmentLines`
  // interpolates into BOTH prompts. The assertion used to live only in
  // `buildWeeklyCheckIn`, so a caller assembling a CheckIn itself walked straight
  // past it. These four lock the builders themselves.
  const leakyEquipment = (field: 'name' | 'details') => [
    {
      id: 'eq_1',
      category: 'bike' as const,
      name: field === 'name' ? 'Canyon — mads@example.com' : 'Canyon Speedmax',
      details: field === 'details' ? 'bought from jane@example.com' : 'CF SLX',
      addedDate: '2026-01-04',
    },
  ];

  it.each(['name', 'details'] as const)(
    'refuses equipment %s carrying an email — Coach Chat',
    (field) => {
      expect(() =>
        buildChatPrompt({ ...BASE, equipment: leakyEquipment(field) }, '2026-08-12'),
      ).toThrow(/identifier/i);
    },
  );

  it.each(['name', 'details'] as const)(
    'refuses equipment %s carrying an email — Weekly Session',
    (field) => {
      const ctx = buildWeeklyContext(
        { ...BASE, weeklySessionNumber: 4, equipment: leakyEquipment(field) },
        [],
        [],
        [],
        [],
      );
      expect(() => renderWeeklyPrompt(ctx)).toThrow(/identifier/i);
    },
  );

  // A staged week's notes are free text that reached the prompt boundary from
  // storage; the boundary asserts on them regardless of who wrote them
  // (CodeRabbit, PR #69; the chat path since training-architecture/20).
  const leakyStaged = [
    { date: '2026-08-14', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: `call ${EMAIL} first` },
  ];

  it('refuses a staged week whose note carries an email — Weekly Session', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], [], null, '2026-08-12');
    expect(() => renderWeeklyPrompt({ ...ctx, stagedProposal: leakyStaged })).toThrow(/identifier/i);
  });

  it('refuses a staged week whose note carries an email — Coach Chat', () => {
    const window = { start: '2026-08-12', end: '2026-08-16', excludedDates: [], fellThrough: false };
    expect(() => buildChatPrompt(BASE, '2026-08-12', null, [], { window, stagedProposal: leakyStaged })).toThrow(
      /identifier/i,
    );
  });

  it('the Weekly Session prompt carries no name or email', () => {
    const ctx = buildWeeklyContext(
      { ...withIdentity, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
    );
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).not.toContain(NAME);
    expect(prompt).not.toContain('Realname');
    expect(prompt).not.toContain(EMAIL);
  });
});

describe('buildWeeklyContext — raceTarget', () => {
  it('forwards raceTarget from checkIn', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, raceTarget: 'Ironman Copenhagen' },
      [],
      [],
      [],
      [],
    );
    expect(ctx.checkIn.raceTarget).toBe('Ironman Copenhagen');
  });

  it('forwards undefined raceTarget gracefully', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1 }, [], [], [], []);
    expect(ctx.checkIn.raceTarget).toBeUndefined();
  });
});

describe('renderWeeklyPrompt — Week 1 raceTarget', () => {
  it('includes raceTarget in Week 1 prompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, raceTarget: 'Ironman Copenhagen' },
      [],
      [],
      [],
      [],
    );
    expect(renderWeeklyPrompt(ctx)).toContain('Ironman Copenhagen');
  });

  it('has no RACE instruction when raceTarget absent', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).not.toContain('RACE:');
  });

  it('does not include raceTarget in Week 4+ prompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4, raceTarget: 'Ironman Copenhagen' },
      [],
      [],
      [],
      [],
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('Ironman Copenhagen');
  });

  it('Week 1 prompt uses SESSION 1 arc', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 1 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).toContain('ARC — SESSION 1');
  });

  it('Week 4 prompt uses SESSION 4+ arc', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).toContain('ARC — SESSION 4+');
  });
});

const ONBOARDING: Onboarding = {
  sportBackground: ['Runner', 'Gym'],
  availableHours: '3–6h',
  motivation: 'Completion',
  bestTime: null,
  weakestDiscipline: null,
  hasHumanCoach: null,
  targetTime: null,
  trackedMetrics: null,
};

describe('onboarding answers reach every Coach prompt', () => {
  it('weekly prompt lists the answers with a never-re-ask instruction', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, onboarding: ONBOARDING },
      [],
      [],
      [],
      [],
    );
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('NEVER ask for this information again');
    expect(prompt).toContain('Sport background: Runner, Gym');
    // The ceiling framing is the point of this field, so the assertion pins it
    // rather than just the number: a bare "Training time available: 3–6h" read
    // as current volume when `coach:say` was run against it (2026-08-21).
    expect(prompt).toContain(
      'Time available to train: 3–6h per week (a ceiling to plan within — not what they currently do)',
    );
    expect(prompt).toContain('Motivation: Completion');
  });

  it('chat prompt includes the answers, experience level and race', () => {
    // Name and date together: Chat renders the same HORIZON line the Weekly
    // Session does, and a race with no date is not a race on either surface.
    const prompt = buildChatPrompt({
      ...BASE,
      onboarding: ONBOARDING,
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    });
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('xp=intermediate');
    expect(prompt).toContain('race=Ironman Copenhagen on 2027-08-15');
  });

  it('omits the block entirely when nothing was answered', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 1, onboarding: {} },
      [],
      [],
      [],
      [],
    );
    // The arc instructions may reference the block by name; the block itself must be absent.
    expect(renderWeeklyPrompt(ctx)).not.toContain('athlete already answered these at onboarding');
  });
});

describe('weekly prompt — the propose_week_plan tool', () => {
  it('tells the Coach to propose the plan (not save) once agreed, with dated sessions', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('propose_week_plan');
    expect(prompt).toContain('does NOT save');
    expect(prompt).toContain('YYYY-MM-DD');
  });
});

describe('weekly prompt — planning-phase Doubles instruction', () => {
  it('tells the Coach it may propose two sessions on one day, never forced', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('two sessions on one day');
    expect(prompt).toContain('Never forced');
  });
});

describe('skippedSessions — natural references', () => {
  it('renders date + type without ids', () => {
    const line = formatSkippedSessions([{ date: '2026-07-15', sessionType: 'Recovery' }]);
    expect(line).toContain('2026-07-15');
    expect(line).toContain('Recovery');
    expect(line).toContain('skipped');
    expect(line).not.toMatch(/s_[a-z0-9]/);
  });

  it('adds the position qualifier only when provided (same-type Doubles)', () => {
    const withPos = formatSkippedSessions([
      { date: '2026-07-15', sessionType: 'Endurance', position: 2 },
    ]);
    expect(withPos).toContain('2nd Endurance');
    const noPos = formatSkippedSessions([{ date: '2026-07-15', sessionType: 'Endurance' }]);
    expect(noPos).not.toContain('1st');
    expect(noPos).not.toContain('2nd');
  });

  it('reaches the weekly prompt through renderWeeklyPrompt', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [{ date: '2026-07-15', sessionType: 'Endurance', position: 2 }],
      [],
    );
    expect(renderWeeklyPrompt(ctx)).toContain('2nd Endurance');
  });
});

describe('formatWeekFeedback — dates read the same as everywhere else', () => {
  it('names the weekday from local midnight, matching the skipped/activity lines', () => {
    // A bare 'YYYY-MM-DD' parses as UTC; behind UTC that renders the previous
    // day. Both helpers must agree on the weekday for the same date.
    const feedback = formatWeekFeedback([
      { dateKey: '2026-07-15', sessionType: 'Endurance', body: 8, mind: 7 },
    ]);
    const skipped = formatSkippedSessions([
      { date: '2026-07-15', sessionType: 'Endurance' },
    ]);
    expect(feedback).toContain('Wed');
    expect(skipped).toContain('Wed');
  });
});

describe('formatWeekActivity — natural references', () => {
  it('renders a move as date + type → target day, no entity ids', () => {
    const line = formatWeekActivity({
      moves: [{ sessionType: 'Recovery', from: '2026-07-15', to: '2026-07-17' }],
      creations: [],
    });
    expect(line).toContain('moved Wed 2026-07-15 Recovery to Fri 2026-07-17');
    expect(line).not.toMatch(/s_[a-z0-9]/);
  });

  it('adds the position qualifier only for same-type Doubles', () => {
    const withPos = formatWeekActivity({
      moves: [{ sessionType: 'Endurance', from: '2026-07-15', to: '2026-07-17', position: 2 }],
      creations: [],
    });
    expect(withPos).toContain('2nd Endurance');
    const noPos = formatWeekActivity({
      moves: [{ sessionType: 'Endurance', from: '2026-07-15', to: '2026-07-17' }],
      creations: [],
    });
    expect(noPos).not.toContain('1st');
  });

  it('renders Athlete Session creations, flagging retro-logs', () => {
    const line = formatWeekActivity({
      moves: [],
      creations: [
        { sessionType: 'Strength', dateKey: '2026-07-18', retro: false },
        { sessionType: 'Mobility', dateKey: '2026-07-14', retro: true },
      ],
    });
    expect(line).toContain('added Sat 2026-07-18 Strength');
    expect(line).toContain('added Tue 2026-07-14 Mobility (retro-logged as done)');
  });

  it('returns null when there is nothing to report', () => {
    expect(formatWeekActivity({ moves: [], creations: [] })).toBeNull();
    expect(formatWeekActivity(undefined)).toBeNull();
  });
});

describe('weekly prompt — week activity as silent background', () => {
  const ACTIVITY = {
    moves: [{ sessionType: 'Recovery', from: '2026-07-15', to: '2026-07-17' }],
    creations: [{ sessionType: 'Strength', dateKey: '2026-07-18', retro: false }],
  };

  it('injects moves and creations with the no-challenge instruction', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
      ACTIVITY,
    );
    const prompt = renderWeeklyPrompt(ctx);
    expect(prompt).toContain('WEEK ACTIVITY');
    expect(prompt).toContain('moved Wed 2026-07-15 Recovery to Fri 2026-07-17');
    expect(prompt).toContain('added Sat 2026-07-18 Strength');
    expect(prompt.toLowerCase()).toContain('never challenge');
  });

  it('an empty log produces no move section', () => {
    const ctx = buildWeeklyContext(
      { ...BASE, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
      { moves: [], creations: [] },
    );
    expect(renderWeeklyPrompt(ctx)).not.toContain('WEEK ACTIVITY');
  });

  it('no weekActivity at all produces no move section', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []);
    expect(renderWeeklyPrompt(ctx)).not.toContain('WEEK ACTIVITY');
  });
});

// The no-identity-in-prompts rule (GDPR decision 1): a real name or email must
// never reach a rendered prompt. The check-in builder is what enforces this by
// never populating identity; here we prove the prompt strings carry no such field.
describe('no real identity reaches a prompt', () => {
  it('renders only the persona label and profile, never an email', () => {
    const weekly = renderWeeklyPrompt(
      buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], []),
    );
    const chat = buildChatPrompt(BASE);
    expect(weekly).not.toContain('@');
    expect(chat).not.toContain('@');
  });
});

// code-health/07 — the Coach must not be told a readiness the athlete never
// gave. Until a Check-in feature exists there is no readiness, and the honest
// rendering is *absence*: the STATE line keeps what is real (phase, sessions,
// xp) and simply carries no scores. Labelling invented numbers as placeholders
// would be worse — AGENTS.md: if the model must not use a value, do not send it.
describe('no fabricated readiness reaches a prompt (code-health/07)', () => {
  const NO_READINESS: CheckIn = {
    phase: 'Base Building',
    commStyle: '',
    experienceLevel: 'intermediate',
    sessionCount: 5,
    language: 'English',
    weeklySessionDay: 'Monday',
    fixedConstraints: [],
    equipment: [],
  };

  // Each score is asserted by its own rendered token rather than a bare number,
  // so an unrelated digit elsewhere in the prompt cannot make this pass or fail.

  it('the Weekly Session STATE line keeps phase, sessions and xp but carries no scores', () => {
    const ctx = buildWeeklyContext(
      { ...NO_READINESS, weeklySessionNumber: 4 },
      [],
      [],
      [],
      [],
      null,
      '2026-08-18',
    );
    const prompt = renderWeeklyPrompt(ctx);

    expect(prompt).toContain('STATE: phase=Base Building sessions=5 xp=intermediate');
    for (const token of READINESS_SCORE_TOKENS) expect(prompt).not.toMatch(token);
  });

  it('the Coach Chat CONTEXT line carries no scores either', () => {
    const prompt = buildChatPrompt(NO_READINESS, '2026-08-18');

    expect(prompt).toContain('phase=Base Building xp=intermediate sessions=5');
    for (const token of READINESS_SCORE_TOKENS) expect(prompt).not.toMatch(token);
  });

  // The Coach is told to reason from readiness. With none to reason from it must
  // be told that, and told to ask — which is what the Presence Arc's P1 already
  // has it doing, so the two must not contradict each other.
  it('tells the Coach it has no readiness data and should ask', () => {
    const weekly = renderWeeklyPrompt(
      buildWeeklyContext({ ...NO_READINESS, weeklySessionNumber: 4 }, [], [], [], [], null, '2026-08-18'),
    );
    const chat = buildChatPrompt(NO_READINESS, '2026-08-18');

    expect(weekly).toContain('NO CHECK-IN DATA');
    expect(chat).toContain('NO CHECK-IN DATA');
  });

  // The path stays live for when a Check-in feature lands: given real numbers,
  // the block renders exactly as it does today.
  it('renders only what the athlete gave, when a device fed nothing', () => {
    // The state this slice actually ships in: three scores from the Check-in and
    // nothing from a wearable. The absent tokens are absent, not zeroed — and
    // the Coach is told separately that it cannot see them.
    const prompt = buildChatPrompt(
      { ...NO_READINESS, readiness: { body: 4, energy: 3, sleepQuality: 5 } },
      '2026-08-18',
    );

    expect(prompt).toContain('body=4/10 energy=3/10 sleep-quality=5/10');
    expect(prompt).not.toContain('sleep=');
    expect(prompt).not.toContain('pulse=');
    expect(prompt).not.toContain('mental=');
    // Single-spaced: the absent tokens are dropped, not joined as blanks. A run
    // of spaces where a number should be is a hole, and the STATE line is read
    // by the model as a list of facts rather than as prose that can have gaps.
    expect(prompt).not.toMatch(/sleep-quality=5\/10 {2}/);
    expect(prompt).not.toContain('NO CHECK-IN DATA');
    expect(prompt).toContain('NO DEVICE DATA');
  });

  it('renders the scores when a real Check-in supplied them', () => {
    const prompt = buildChatPrompt(
      { ...NO_READINESS, readiness: { body: 4, energy: 3, sleepQuality: 5, mental: 5, sleepHours: 5.5, restingPulse: 68 } },
      '2026-08-18',
    );

    // The athlete's own three first, then the ones a device or a rated session
    // supplied. Order matters only in that it is stable; what matters is that
    // every token present is a number somebody actually gave.
    expect(prompt).toContain(
      'body=4/10 energy=3/10 sleep-quality=5/10 mental=5/10 sleep=5.5h pulse=68bpm',
    );
    expect(prompt).not.toContain('NO CHECK-IN DATA');
  });

  // The same rule as the readiness itself, one field over. A missing optional
  // renders as an absent token, never as the word "undefined" — the Coach cannot
  // read a template hole as absence, and not telling it things that are not so
  // is this whole file's subject.
  it('omits a token it has no value for, rather than writing undefined', () => {
    const bare: CheckIn = {
      phase: undefined,
      sessionCount: undefined,
      experienceLevel: undefined,
      language: 'English',
      commStyle: '',
    };

    const prompts = {
      chat: buildChatPrompt(bare, '2026-08-18'),
      weekly: renderWeeklyPrompt(
        buildWeeklyContext({ ...bare, weeklySessionNumber: 1 }, [], [], [], [], null, '2026-08-18'),
      ),
    };

    for (const [name, prompt] of Object.entries(prompts)) {
      expect(prompt, `${name} prompt`).not.toContain('undefined');
      expect(prompt, `${name} prompt`).not.toContain('sessions=');
      expect(prompt, `${name} prompt`).not.toContain('phase=');
      // The field with a documented default still renders, so an absent token
      // means absent data rather than a whole line quietly dropping out.
      expect(prompt, `${name} prompt`).toContain('xp=intermediate');
    }
  });
});

// ── Coach Chat sees the week ─────────────────────────────────────────────────

const planned = (over: Partial<WeekSession> = {}): WeekSession => ({
  date: '2026-08-18',
  sessionType: 'Intensity',
  status: 'planned',
  origin: 'coach',
  title: null,
  durationMinutes: 60,
  zone: '4',
  note: null,
  ...over,
});

describe('formatWeekSessions', () => {
  it("never sends a Head Coach's note, and keeps every other origin's", () => {
    // Mads, 2026-08-21. A Head Coach's note is a third party's prose *about*
    // the athlete, written by someone who never agreed to have it processed —
    // and a name in it ("I want you sharp for Lars's ride") is invisible to
    // `assertNoDirectIdentifier`, which recognises email and phone shapes only.
    // So it is not sent, rather than filtered.
    //
    // The other origins are deliberately unaffected: a `coach` note is the
    // Coach's own words coming back to it, and an `athlete` note is the
    // athlete's own free text, which the consent disclosure covers. Dropping
    // those too would cost the Coach real context for no privacy gain.
    const fromHeadCoach = formatWeekSessions([
      planned({ origin: 'head_coach', note: "ride with Bjorn, he'll hold your pace" }),
    ]);
    expect(fromHeadCoach).not.toContain('Bjorn');
    expect(fromHeadCoach).not.toContain('hold your pace');
    // The session itself still appears, attributed — only the prose is gone.
    expect(fromHeadCoach).toContain('Head Coach');

    for (const origin of ['coach', 'athlete', 'garmin'] as const) {
      expect(
        formatWeekSessions([planned({ origin, note: 'easy spin, keep it social' })]),
        `a ${origin} note should still reach the Coach`,
      ).toContain('easy spin, keep it social');
    }
  });

  it('renders day, date, type, status and authorship', () => {
    const line = formatWeekSessions([planned()]);
    expect(line).toContain('2026-08-18');
    expect(line).toContain('Intensity');
    expect(line).toContain('planned');
    expect(line).toContain('you planned this');
  });

  it('names the Head Coach as the author of a Prescribed Session', () => {
    expect(formatWeekSessions([planned({ origin: 'head_coach' })])).toContain('Head Coach');
  });

  // An Athlete Session typed `Other` carries its meaning in the label alone.
  it("renders the athlete's own label beside the type", () => {
    const line = formatWeekSessions([planned({ sessionType: 'Other', title: 'Yoga' })]);
    expect(line).toContain('Other "Yoga"');
  });

  it('renders no empty quotes when the session has no label', () => {
    expect(formatWeekSessions([planned()])).not.toContain('""');
  });

  it('is null for an empty week — a heading with nothing under it says nothing', () => {
    expect(formatWeekSessions([])).toBeNull();
    expect(formatWeekSessions(undefined)).toBeNull();
  });

  // CONTEXT.md, Week Activity: the qualifier exists only for same-type Doubles.
  it('qualifies a same-type Double by position', () => {
    const lines = formatWeekSessions([
      planned({ sessionType: 'Endurance', position: 1 }),
      planned({ sessionType: 'Endurance', position: 2 }),
    ]);
    expect(lines).toContain('1st Endurance');
    expect(lines).toContain('2nd Endurance');
  });

  it('renders the tapped session short, deferring its detail to the Reference', () => {
    const lines = formatWeekSessions([
      planned({ isReference: true, note: 'threshold set, hold 4x8', durationMinutes: 75 }),
    ]);
    expect(lines).toContain('detail below');
    expect(lines).not.toContain('threshold set');
    expect(lines).not.toContain('75 min');
    // Status and authorship still ride along — the week stays complete.
    expect(lines).toContain('planned');
  });
});

describe('the week block inside the Coach Chat prompt', () => {
  it('renders the week with its heading', () => {
    const prompt = buildChatPrompt(BASE, '2026-08-17', null, [planned()]);
    expect(prompt).toContain('THIS WEEK');
    expect(prompt).toContain('Intensity');
  });

  it('renders no week block at all for an athlete with no sessions this week', () => {
    const prompt = buildChatPrompt(BASE, '2026-08-17', null, []);
    expect(prompt).not.toContain('THIS WEEK');
  });

  // ADR 0003 / CONTEXT.md, Prescribed Session: the AI explains and holds on a
  // Head-Coach-authored session. Without this the Coach offers changes it is
  // forbidden to make and the athlete meets a refusal instead of coaching.
  it('carries the authority rule when the week holds a Prescribed Session', () => {
    const prompt = buildChatPrompt(BASE, '2026-08-17', null, [
      planned({ origin: 'head_coach' }),
    ]);
    expect(prompt).toContain('AUTHORITY');
    expect(prompt).toMatch(/never offer to change/i);
  });

  it('spends no prompt on the authority rule when no session is the Head Coach’s', () => {
    const prompt = buildChatPrompt(BASE, '2026-08-17', null, [planned({ origin: 'coach' })]);
    expect(prompt).not.toContain('AUTHORITY');
  });

  // The tapped session is described once: the week lists it, the SESSION
  // DISCUSSION block carries its parameters and note.
  it('does not render a tapped Reference twice', () => {
    const reference = {
      type: 'Intensity',
      dayLabel: '2026-08-18',
      duration: '60 min',
      zone: '4',
      note: 'threshold set, hold 4x8',
      status: 'planned',
    };
    const prompt = buildChatPrompt(BASE, '2026-08-17', reference, [
      planned({ isReference: true, note: 'threshold set, hold 4x8' }),
    ]);
    expect(prompt.match(/threshold set/g)).toHaveLength(1);
  });

  it('carries no entity id', () => {
    const prompt = buildChatPrompt(BASE, '2026-08-17', null, [planned()]);
    expect(prompt).not.toMatch(/sess_/);
  });

  // The week arrives as its own argument, so it bypasses the check-in
  // assertion — the same hole the Reference had. Note: this catches a *shaped*
  // identifier (email, phone). A bare name in a note is NOT caught here, by
  // design — see `assertNoDirectIdentifier`.
  it('refuses a week whose session note carries an email', () => {
    expect(() =>
      buildChatPrompt(BASE, '2026-08-17', null, [
        planned({ note: 'ride with me, reach me at jane.realname@example.com' }),
      ]),
    ).toThrow(/identifier/i);
  });
});

/**
 * The prompt formatters, exercised directly.
 *
 * These are the functions that turn training data into the sentences the Coach
 * reads, and until 2026-09-03 several of their branches were reached by no test
 * at all — the golden prompts pass empty lists for most of them, so the
 * formatters returned early and the interesting half never ran. A wrong weekday
 * or a swallowed qualifier here is invisible in review and obvious to an
 * athlete.
 */
afterEach(() => {
  // Only the two default-date tests freeze it; restoring unconditionally is
  // cheaper than remembering which ones did.
  vi.useRealTimers();
});

describe('the prompt formatters, branch by branch', () => {
  it('defaults every optional input when only a check-in is given', () => {
    // Also the only exercise of the clock seam: `today` defaults to now.
    // The clock is frozen rather than read twice — the assertion and the code
    // under test each took their own `Date`, so a run straddling UTC midnight
    // compared two different days and failed for no reason. CodeRabbit, PR #57.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'));
    const ctx = buildWeeklyContext(BASE);
    expect(ctx.today).toBe('2026-08-19');
    expect(ctx).toMatchObject({
      patterns: [],
      skippedSessions: [],
      unavailableDates: [],
      feedbackSummary: null,
      weekActivityLines: null,
    });
  });

  it('distinguishes null from empty for skipped sessions', () => {
    expect(formatSkippedSessions()).toBeNull();
    expect(formatSkippedSessions([])).toBeNull();
  });

  it('joins several skipped sessions with a semicolon', () => {
    expect(
      formatSkippedSessions([
        { date: '2026-08-17', sessionType: 'Endurance' },
        { date: '2026-08-19', sessionType: 'Tempo' },
      ]),
    ).toBe('Mon 2026-08-17: Endurance, skipped; Wed 2026-08-19: Tempo, skipped');
  });

  it('ordinals the Double qualifier 1st, 2nd, 3rd, then Nth', () => {
    const at = (position: number) =>
      formatSkippedSessions([{ date: '2026-08-17', sessionType: 'Endurance', position }]);
    expect(at(1)).toContain('1st Endurance');
    expect(at(2)).toContain('2nd Endurance');
    expect(at(3)).toContain('3rd Endurance');
    expect(at(4)).toContain('4th Endurance');
  });

  it('names weekdays in en-GB short form, from local midnight', () => {
    // Sunday is the one that catches a UTC-parsed date key west of Greenwich:
    // it would render as the Saturday before.
    expect(formatSkippedSessions([{ date: '2026-08-23', sessionType: 'Recovery' }])).toBe(
      'Sun 2026-08-23: Recovery, skipped',
    );
  });

  it('treats a week activity with no moves and no creations as nothing to report', () => {
    expect(formatWeekActivity()).toBeNull();
    expect(formatWeekActivity(null)).toBeNull();
    expect(formatWeekActivity({})).toBeNull();
    expect(formatWeekActivity({ moves: [] })).toBeNull();
    expect(formatWeekActivity({ creations: [] })).toBeNull();
  });

  it('reports creations when there are no moves at all, and flags a retro-log', () => {
    expect(
      formatWeekActivity({
        creations: [
          { sessionType: 'Strength', dateKey: '2026-08-18', retro: true },
          { sessionType: 'Mobility', dateKey: '2026-08-19', retro: false },
        ],
      }),
    ).toBe(
      '- added Tue 2026-08-18 Strength (retro-logged as done)\n' +
        '- added Wed 2026-08-19 Mobility',
    );
  });

  it('maps a feedback score across the whole emoji scale, and falls back off it', () => {
    const line = (body: number, mind: number) =>
      formatWeekFeedback([{ dateKey: '2026-08-18', sessionType: 'Endurance', body, mind, comment: null }]);
    expect(line(1, 10)).toContain('Body 😫 (1/10)');
    expect(line(1, 10)).toContain('Mind 😄 (10/10)');
    expect(line(5, 5)).toContain('Body 😐 (5/10)');
    // Off the scale entirely: a dash rather than `undefined` in front of the Coach.
    expect(line(100, 100)).toContain('Body — (100/10)');
  });

  it('names an untyped session Training, and quotes a comment only when there is one', () => {
    const [withComment] = [
      formatWeekFeedback([
        { dateKey: '2026-08-18', sessionType: '', body: 7, mind: 7, comment: 'legs heavy' },
      ]),
    ];
    expect(withComment).toContain('· Training ·');
    expect(withComment).toContain('· "legs heavy"');

    const bare = formatWeekFeedback([
      { dateKey: '2026-08-18', sessionType: 'Endurance', body: 7, mind: 7, comment: null },
    ]);
    expect(bare).not.toContain('"');
  });

  it('distinguishes null from empty for week feedback', () => {
    expect(formatWeekFeedback()).toBeNull();
    expect(formatWeekFeedback([])).toBeNull();
  });
});

/**
 * The block builders' branches.
 *
 * Each of these is a place where the Coach is either told something or not, and
 * the difference is a coaching difference rather than a cosmetic one — a joined
 * list that loses its separator, an omitted tag that renders `undefined`, a
 * nudge that fires in the wrong week.
 */
describe('the weekly prompt block builders, branch by branch', () => {
  const TUESDAY = '2026-08-18';

  function weekly(overrides: Partial<CheckIn> = {}, unavailable: string[] = []) {
    return renderWeeklyPrompt(
      buildWeeklyContext(
        { ...BASE, weeklySessionNumber: 4, ...overrides },
        [],
        [],
        [],
        unavailable,
        null,
        TUESDAY,
      ),
    );
  }

  it('lists several Fixed Constraints on one line, comma separated', () => {
    expect(weekly({ fixedConstraints: ['Monday', 'Thursday'] })).toContain(
      'NO TRAINING ON: Monday, Thursday',
    );
  });

  it('names the weekday of the planning day in English', () => {
    // 2026-08-18 is a Tuesday. A UTC-parsed key would render Monday for anyone
    // west of Greenwich, and a different locale would not say 'Tuesday' at all.
    expect(weekly({ weeklySessionDay: 'Monday' })).toContain('today Tuesday');
  });

  it('lists several Unavailable Dates on one line, comma separated', () => {
    expect(weekly({}, ['2026-08-20', '2026-08-21'])).toContain(
      'UNAVAILABLE: 2026-08-20, 2026-08-21',
    );
  });

  it('omits a STATE tag whose value is absent or blank, rather than rendering the word', () => {
    const blank = weekly({ phase: '', experienceLevel: '' });
    expect(blank).not.toContain('undefined');
    expect(blank).not.toContain('phase=');
    // A real value still renders.
    expect(weekly({ phase: 'Peak' })).toContain('phase=Peak');
  });

  it('joins several patterns with a semicolon', () => {
    const ctx = buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], [], null, TUESDAY);
    const withPatterns = { ...ctx, patterns: ['sleeps badly before intervals', 'skips Fridays'] };
    expect(renderWeeklyPrompt(withPatterns)).toContain(
      'PATTERNS: sleeps badly before intervals; skips Fridays.',
    );
  });

});

describe('buildChatPrompt — its own branches', () => {
  it('renders the CONTEXT line without a tag whose value is missing', () => {
    const prompt = buildChatPrompt({ ...BASE, phase: undefined, sessionCount: undefined });
    expect(prompt).not.toContain('undefined');
    expect(prompt).toContain('xp=intermediate');
  });

  it('falls back to intermediate when no experience level is set', () => {
    expect(buildChatPrompt({ ...BASE, experienceLevel: '' })).toContain('xp=intermediate');
  });

  it('defaults today to the real clock when it is not passed', () => {
    // Frozen for the same reason as the weekly default above.
    vi.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'));
    expect(buildChatPrompt(BASE)).toContain('TODAY: 2026-08-19');
  });
});

describe('formatWeekSessions — authorship labels and the parameter tail', () => {
  // Authorship is load-bearing, not decorative: the Coach's plan authority
  // differs per author (ADR 0003), so each label is pinned to its exact words.
  it('names every origin in the athlete-facing wording', () => {
    const labelFor = (origin: WeekSession['origin']) => formatWeekSessions([planned({ origin })]);
    expect(labelFor('coach')).toContain('you planned this');
    expect(labelFor('head_coach')).toContain("the athlete's Head Coach set this");
    expect(labelFor('athlete')).toContain('the athlete added this themselves');
    // A Detected Activity in CONTEXT.md's terms, said plainly to the model.
    expect(labelFor('garmin')).toContain("logged from the athlete's watch");
  });

  it('renders duration and zone as a separated tail, and omits it entirely when there is neither', () => {
    expect(formatWeekSessions([planned({ durationMinutes: 60, zone: '4' })])).toContain(
      ' · 60 min · Zone 4',
    );
    expect(formatWeekSessions([planned({ durationMinutes: 60, zone: null })])).toContain(
      ' · 60 min',
    );
    expect(formatWeekSessions([planned({ durationMinutes: null, zone: '4' })])).toContain(
      ' · Zone 4',
    );

    // Exactly, not just "no separator": an empty tail must render as nothing at
    // all, and `toContain` cannot tell nothing from something unexpected.
    expect(
      formatWeekSessions([planned({ durationMinutes: null, zone: null, note: null })]),
    ).toBe('- Tue 2026-08-18: Intensity — planned (you planned this)');
  });
});

describe('the last exact-shape assertions', () => {
  it('renders a feedback line exactly, with and without a comment, one per line', () => {
    const lines = formatWeekFeedback([
      { dateKey: '2026-08-18', sessionType: 'Endurance', body: 7, mind: 7, comment: 'legs heavy' },
      { dateKey: '2026-08-19', sessionType: 'Tempo', body: 7, mind: 7, comment: null },
    ]);
    expect(lines).toBe(
      '- Tue 18 Aug · Endurance · Body 🙂 (7/10) · Mind 🙂 (7/10) · "legs heavy"\n' +
        '- Wed 19 Aug · Tempo · Body 🙂 (7/10) · Mind 🙂 (7/10)',
    );
  });

  it('renders a week-session line exactly', () => {
    expect(formatWeekSessions([planned({ durationMinutes: 60, zone: '4' })])).toBe(
      '- Tue 2026-08-18: Intensity · 60 min · Zone 4 — planned (you planned this)',
    );
  });

  it('renders the Coach Chat CONTEXT line exactly, with an absent tag simply gone', () => {
    const prompt = buildChatPrompt(
      { ...BASE, phase: undefined, sessionCount: 4, experienceLevel: 'advanced', readiness: undefined },
      '2026-08-18',
    );
    expect(prompt).toContain('CONTEXT (use silently — never cite scores/numbers):\nxp=advanced sessions=4');
  });

  it('accepts a Reference with nothing identifying in it', () => {
    expect(() =>
      buildChatPrompt(BASE, '2026-08-18', {
        type: 'Intensity',
        dayLabel: 'Tuesday 18 August',
        duration: '60 min',
        zone: 'Z4',
        note: 'threshold set',
        status: 'planned',
      }),
    ).not.toThrow();
  });
});

describe('the equipment nudge, exhaustively', () => {
  const at = (weeklySessionNumber: number | undefined, equipment: CheckIn['equipment']) =>
    renderWeeklyPrompt(
      buildWeeklyContext({ ...BASE, weeklySessionNumber, equipment }, [], [], [], [], null, '2026-08-18'),
    );

  const NUDGE = 'EQUIPMENT NUDGE:';
  const someKit: CheckIn['equipment'] = [
    {
      id: 'eq_1',
      category: 'bike',
      name: 'Canyon Speedmax',
      details: 'CF SLX',
      addedDate: '2026-08-01',
    },
  ];

  it('fires in sessions 2 and 3 only, and never once there is equipment', () => {
    expect(at(2, [])).toContain(NUDGE);
    expect(at(3, [])).toContain(NUDGE);
    expect(at(1, [])).not.toContain(NUDGE);
    expect(at(4, [])).not.toContain(NUDGE);
    // The whole point of the nudge is an empty tab — a full one silences it.
    expect(at(2, someKit)).not.toContain(NUDGE);
    expect(at(3, someKit)).not.toContain(NUDGE);
  });

  it('does not fire when the session number is unknown or below the range', () => {
    expect(at(undefined, [])).not.toContain(NUDGE);
    expect(at(0, [])).not.toContain(NUDGE);
  });
});

// ── Grounding: the Coach cites its sources (knowledge-oracle/05) ──────────────

describe('the GROUNDING block — both athlete-facing prompts carry it', () => {
  const TUESDAY = '2026-08-18';
  const weekly = () =>
    renderWeeklyPrompt(buildWeeklyContext({ ...BASE, weeklySessionNumber: 4 }, [], [], [], [], null, TUESDAY));
  const chat = () => buildChatPrompt(BASE, TUESDAY);

  it('names the tool and asks for it before a training-science fact', () => {
    for (const prompt of [weekly(), chat()]) {
      expect(prompt).toContain('GROUNDING:');
      expect(prompt).toContain('look_up_training_science');
      expect(prompt).toMatch(/before stating a training-science fact/i);
    }
  });

  it('instructs Declared Uncertainty when nothing comes back, and silence about sources always', () => {
    // Decision 3 (Mads, 2026-09-11): the reply never names a source — the app
    // lists them beneath it. This is what makes the voice criterion testable.
    for (const prompt of [weekly(), chat()]) {
      expect(prompt).toContain('do not have grounding for that claim');
      expect(prompt).toContain('do not assert it');
      expect(prompt).toContain('Never write citations, footnotes or source names in your reply');
      expect(prompt).toContain('the app lists your sources beneath it');
    }
  });
});

// ── The horizon: Race Distance and the Target Race (training-architecture/02) ──

/**
 * The Coach plans every week with no horizon and no idea what shape of race the
 * athlete is training for. Race Distance decides the shape of a week whether or
 * not a race is booked — the winter-base athlete of *Distancens Arkitektur* §14
 * — so it is stated always, and its *absence* is stated too rather than left for
 * the model to fill in.
 */
describe('the horizon reaches the prompt, including when there is none', () => {
  const TUESDAY = '2026-08-18';

  function weekly(overrides: Partial<CheckIn> = {}) {
    return renderWeeklyPrompt(
      buildWeeklyContext(
        { ...BASE, weeklySessionNumber: 4, ...overrides },
        [],
        [],
        [],
        [],
        null,
        TUESDAY,
      ),
    );
  }

  it('states the Race Distance the athlete trains for', () => {
    expect(weekly({ raceDistance: 'Full' })).toContain('HORIZON:');
    expect(weekly({ raceDistance: 'Full' })).toContain('distance=Full');
  });

  it('states the Target Race and its date', () => {
    const prompt = weekly({
      raceDistance: 'Full',
      raceTarget: 'Ironman Copenhagen',
      raceDate: '2027-08-15',
    });
    expect(prompt).toContain('race=Ironman Copenhagen');
    expect(prompt).toContain('2027-08-15');
  });

  it('says plainly that there is no race, rather than omitting the subject', () => {
    // Omission is the failure mode this block exists to avoid: a prompt with no
    // race line reads to the model as a prompt whose race line was forgotten,
    // and it will invent a horizon to plan toward.
    const prompt = weekly({ raceDistance: 'Half' });
    expect(prompt).toContain('no race booked');
    expect(prompt).toContain('distance=Half');
  });

  // ── Races beyond the first (training-architecture/09) ──────────────────────
  describe('tune-ups, late races and the tune-up window', () => {
    const target = { raceDistance: 'Full', raceTarget: 'Ironman Copenhagen', raceDate: '2027-08-15' };
    const olympic = { name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic' };

    it('names each Tune-up Race as an ordinary training day that is not tapered for', () => {
      const prompt = weekly({ ...target, tuneUps: [olympic] });
      expect(prompt).toContain('TUNE-UPS: Olympic Odense on 2027-03-01 (Olympic)');
      expect(prompt).toContain('ordinary training day, do not taper');
    });

    it('omits the TUNE-UPS line entirely when there are none', () => {
      expect(weekly(target)).not.toContain('TUNE-UPS');
      expect(weekly({ ...target, tuneUps: [] })).not.toContain('TUNE-UPS');
    });

    it('adds the eve-easy clause only when the interview option is on', () => {
      // The option is built and its value is the Head Coach interview's. Both
      // values render, so flipping the constant later changes one line. Exact
      // lines, so nothing can be appended to the "off" case unnoticed.
      expect(weekly({ ...target, tuneUps: [olympic], tuneUpEveEasy: false })).toContain(
        '\nTUNE-UPS: Olympic Odense on 2027-03-01 (Olympic) — ordinary training day, do not taper\n',
      );
      expect(weekly({ ...target, tuneUps: [olympic], tuneUpEveEasy: true })).toContain(
        '\nTUNE-UPS: Olympic Odense on 2027-03-01 (Olympic) — ordinary training day, do not taper — keep the day before easy\n',
      );
    });

    it('lists several tune-ups or late races on one line each, separated by semicolons, beneath HORIZON', () => {
      const half = { name: 'Half Aarhus', date: '2027-05-01', distance: 'Half' };
      const prompt = weekly({ ...target, tuneUps: [olympic, half], lateRaces: [half, olympic] });
      expect(prompt).toContain(
        'HORIZON: distance=Full · race=Ironman Copenhagen on 2027-08-15\nTUNE-UPS: Olympic Odense on 2027-03-01 (Olympic); Half Aarhus on 2027-05-01 (Half) — ordinary',
      );
      expect(prompt).toContain('LATE RACE: Half Aarhus on 2027-05-01 (Half); Olympic Odense on 2027-03-01 (Olympic) — entered');
    });

    it('names a race entered after this week was planned, and tells the Coach to say so', () => {
      const prompt = weekly({ ...target, lateRaces: [{ ...olympic, date: '2026-09-27' }] });
      expect(prompt).toContain('LATE RACE: Olympic Odense on 2026-09-27 (Olympic)');
      expect(prompt).toContain('entered after this week was planned');
      expect(prompt).toContain('blocks were not built toward it');
      expect(prompt).toContain('adjust the week only');
    });

    it('omits the LATE RACE line when nothing is late', () => {
      expect(weekly(target)).not.toContain('LATE RACE');
      expect(weekly({ ...target, lateRaces: [] })).not.toContain('LATE RACE');
    });

    it('carries the tune-up window only when the Check-in says today is inside it', () => {
      // The service decides *whether* — `inTuneUpWindow` — and hands the prompt
      // the span only then, so the prompt cannot nag outside the window.
      const prompt = weekly({ ...target, tuneUpWindow: { from: '2026-12-01', to: '2027-02-10' } });
      expect(prompt).toContain('TUNE-UP WINDOW: now (2026-12-01–2027-02-10)');
      expect(prompt).toContain('may suggest');
      expect(prompt).not.toContain('should have');
      expect(prompt).toContain('never imply the plan is deficient');
      expect(weekly(target)).not.toContain('TUNE-UP WINDOW');
    });

    it('renders the same lines in Coach Chat — Chat must not know less than the Weekly Session', () => {
      const prompt = buildChatPrompt(
        { ...BASE, ...target, tuneUps: [olympic], lateRaces: [{ ...olympic, date: '2026-09-27' }] },
        TUESDAY,
      );
      expect(prompt).toContain('TUNE-UPS: Olympic Odense on 2027-03-01 (Olympic)');
      expect(prompt).toContain('LATE RACE: Olympic Odense on 2026-09-27 (Olympic)');
    });
  });

  it('says the distance is unknown for an athlete who was never asked', () => {
    // Every athlete who onboarded before the question existed. The migration
    // deliberately backfills nothing — a distance is not derivable from a race
    // name, and guessing one is the habit this slice removed.
    const prompt = weekly({ raceDistance: undefined });
    expect(prompt).toContain('distance unknown');
  });

  // CodeRabbit on PR #60: Coach Chat was handed the same CheckIn as the Weekly
  // Session — race, distance, block, the athlete's sentence — and rendered
  // `race=name` and nothing else of it. "Should I do tomorrow's intervals?" is
  // asked in Chat, and the answer depends on how far out the race is and what
  // the athlete said on Monday. A Coach that knows less in Chat than it knew
  // when it planned the week contradicts itself.
  describe('and Coach Chat knows the same horizon', () => {
    const chat = (overrides: Partial<CheckIn> = {}) =>
      buildChatPrompt({ ...BASE, ...overrides }, TUESDAY);

    it('states the Race Distance and the race date, not only the name', () => {
      const prompt = chat({
        raceDistance: 'Full',
        raceTarget: 'Ironman Copenhagen',
        raceDate: '2027-08-15',
      });
      expect(prompt).toContain('HORIZON:');
      expect(prompt).toContain('distance=Full');
      expect(prompt).toContain('race=Ironman Copenhagen on 2027-08-15');
    });

    it('says plainly there is no race, and states the block position when there is one', () => {
      expect(chat({ raceDistance: 'Half' })).toContain('no race booked');
      expect(chat({ phase: 'Block 2 of 4', blockWeek: 'week 3 of 6' })).toContain(
        'Block 2 of 4, week 3 of 6',
      );
    });

    it('carries what the athlete said this week, in their words', () => {
      // The service already reads the Check-in for exactly this — "someone who
      // wrote 'calf tight since Tuesday' on Monday should not have to say it
      // again on Wednesday" — and until now the sentence went nowhere.
      const prompt = chat({ notableSignal: 'calf tight since Tuesday' });
      expect(prompt).toContain('ATHLETE SAID');
      expect(prompt).toContain('"calf tight since Tuesday"');
      expect(chat()).not.toContain('ATHLETE SAID');
    });
  });
});

describe('the current Training Block and the week within it reach the Coach', () => {
  const TUESDAY = '2026-08-18';

  it('names the block and the position, together', () => {
    // `training-architecture/03`: "The Coach prompt carries the current block
    // and the athlete's position within it." Which block alone says the same
    // thing for every week of that block.
    const prompt = renderWeeklyPrompt(
      buildWeeklyContext(
        {
          ...BASE,
          weeklySessionNumber: 4,
          raceDistance: 'Full',
          raceTarget: 'Ironman Copenhagen',
          raceDate: '2027-06-01',
          phase: 'Block 1 of 5',
          blockWeek: 'week 2 of 8',
        },
        [], [], [], [], null, TUESDAY,
      ),
    );

    expect(prompt).toContain('Block 1 of 5, week 2 of 8');
  });

  it('says nothing about a block for an athlete with no horizon', () => {
    // Half a position is worse than none: "week 2 of 8" with no block, or a
    // block with no week, is a number the model reasons from and nobody meant.
    const prompt = renderWeeklyPrompt(
      buildWeeklyContext(
        { ...BASE, weeklySessionNumber: 4, raceDistance: 'Full', phase: undefined },
        [], [], [], [], null, TUESDAY,
      ),
    );

    expect(prompt).toContain('no race booked');
    expect(prompt).not.toContain('week 2 of');
  });
});


describe("the athlete's own words reach the Coach", () => {
  const TUESDAY = '2026-08-18';

  function weekly(overrides: Partial<CheckIn> = {}) {
    return renderWeeklyPrompt(
      buildWeeklyContext(
        { ...BASE, weeklySessionNumber: 4, ...overrides },
        [], [], [], [], null, TUESDAY,
      ),
    );
  }

  it('quotes the sentence and says whose it is', () => {
    // Attributed on purpose. Unlabelled, the Coach can mistake it for something
    // the app derived and repeat it back as its own observation - which is the
    // one thing an athlete's own words must never become.
    const prompt = weekly({ notableSignal: 'calf tight since Tuesday' });

    expect(prompt).toContain('ATHLETE SAID');
    expect(prompt).toContain('"calf tight since Tuesday"');
  });

  it('says nothing at all when the athlete wrote nothing', () => {
    expect(weekly({ notableSignal: null })).not.toContain('ATHLETE SAID');
    expect(weekly()).not.toContain('ATHLETE SAID');
  });
});

// ── Which absence the Coach is told about ────────────────────────────────────
// The 2026-09-10 review changed `noDataBlock` to judge the device fields rather
// than their container. The cases below are the ones that distinguish the two
// versions; without them the fix is a claim the suite cannot check.
describe('which absence the Coach is told about', () => {
  const BARE: CheckIn = {
    phase: 'Base Building',
    commStyle: '',
    experienceLevel: 'intermediate',
    sessionCount: 5,
    language: 'English',
  };

  const chat = (readiness?: CheckIn['readiness']) =>
    buildChatPrompt({ ...BARE, readiness }, '2026-08-18');

  it('says neither once a device has fed both fields', () => {
    // The defect the review found: keyed on the container, this would render
    // `sleep=7h pulse=50bpm` and then assert, one block later, that the Coach
    // has no measured sleep duration — a false claim standing beside the true
    // numbers contradicting it.
    const fed = chat({ body: 6, energy: 5, sleepQuality: 4, sleepHours: 7, restingPulse: 50 });

    expect(fed).toContain('sleep=7h');
    expect(fed).toContain('pulse=50bpm');
    expect(fed).not.toContain('NO DEVICE DATA');
    expect(fed).not.toContain('NO CHECK-IN DATA');
  });

  it('treats a sleep duration alone as a feed', () => {
    // Either field on its own is data the Coach can see, so the blanket "you
    // have no measured sleep duration and no resting heart rate" is already
    // false. Both halves of the condition are load-bearing, one each here.
    const fed = chat({ body: 6, energy: 5, sleepQuality: 4, sleepHours: 7 });

    expect(fed).toContain('sleep=7h');
    expect(fed).not.toContain('NO DEVICE DATA');
  });

  it('treats a resting pulse alone as a feed', () => {
    const fed = chat({ body: 6, energy: 5, sleepQuality: 4, restingPulse: 50 });

    expect(fed).toContain('pulse=50bpm');
    expect(fed).not.toContain('NO DEVICE DATA');
  });
});
