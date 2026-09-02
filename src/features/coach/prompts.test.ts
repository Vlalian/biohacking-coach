import { describe, it, expect } from 'vitest';
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
  readiness: { body: 7, mental: 7, energy: 7, sleep: 7, pulse: 50 },
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
    const prompt = buildChatPrompt({
      ...BASE,
      onboarding: ONBOARDING,
      raceTarget: 'Ironman Copenhagen',
    });
    expect(prompt).toContain('ONBOARDING PROFILE');
    expect(prompt).toContain('xp=intermediate');
    expect(prompt).toContain('race=Ironman Copenhagen');
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
  it('renders the scores when a real Check-in supplied them', () => {
    const prompt = buildChatPrompt(
      { ...NO_READINESS, readiness: { body: 4, mental: 5, energy: 3, sleep: 5.5, pulse: 68 } },
      '2026-08-18',
    );

    expect(prompt).toContain('body=4/10 mental=5/10 energy=3/10 sleep=5.5h pulse=68bpm');
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
