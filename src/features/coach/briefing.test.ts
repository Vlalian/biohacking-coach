import { describe, it, expect } from 'vitest';
import {
  BRIEFING_OPENER,
  briefingRaces,
  buildBriefingContext,
  renderBriefingPrompt,
  toBriefingApiMessages,
  toBriefingReflection,
  type BriefingContext,
  type BriefingPlanEntry,
  type BriefingReports,
} from './briefing';
import type { Message } from './conversation';

const plan: BriefingPlanEntry[] = [
  { date: '2026-08-04', type: 'Endurance', status: 'completed', duration: 90, zone: 'Z2', note: 'steady' },
  { date: '2026-08-06', type: 'Intensity', status: 'planned', duration: 60, zone: 'Z4', note: null },
];

const reports: BriefingReports = {
  profile: {
    phase: 'Build',
    experienceLevel: 'intermediate',
    raceTarget: 'IM Copenhagen',
    sessionsPerWeek: 6,
    onboarding: null,
    capacity: null,
    races: [],
    hasTargetRace: true,
  },
  reflections: [
    { date: '2026-08-04', type: 'Endurance', body: 8, mind: 10, comment: 'strong ride' },
  ],
};

function ctx(over: Partial<BriefingContext> = {}): BriefingContext {
  return {
    today: '2026-08-08',
    plan,
    reports: null,
    transcripts: null,
    ...over,
  };
}

describe('renderBriefingPrompt — the plan is always visible', () => {
  it('names the calendar sessions with no flag', () => {
    const prompt = renderBriefingPrompt(ctx());
    expect(prompt).toContain('PLAN');
    expect(prompt).toContain('Endurance');
    expect(prompt).toContain('steady');
  });

  it('addresses the coach about the athlete, never the athlete', () => {
    const prompt = renderBriefingPrompt(ctx());
    expect(prompt).toContain('briefing their Head Coach');
    expect(prompt).toContain('never use a real name');
  });
});

describe('renderBriefingPrompt — reports gated by shareAthleteReports', () => {
  it('includes the reflections and profile when reports are shared', () => {
    const prompt = renderBriefingPrompt(ctx({ reports }));
    expect(prompt).toContain('SESSION REFLECTIONS');
    expect(prompt).toContain('strong ride');
    expect(prompt).toContain('Race target: IM Copenhagen');
    expect(prompt).not.toContain('has not shared their reflections');
  });

  it('withholds them and says so when reports are not shared', () => {
    const prompt = renderBriefingPrompt(ctx({ reports: null }));
    expect(prompt).toContain('has not shared their reflections');
    expect(prompt).not.toContain('strong ride');
    expect(prompt).not.toContain('IM Copenhagen');
  });
});

describe('renderBriefingPrompt — transcripts gated by shareAiTranscripts', () => {
  it('includes the athlete conversations when shared', () => {
    const prompt = renderBriefingPrompt(
      ctx({ transcripts: [{ kind: 'coach_chat', lines: ['Athlete: I felt tired'] }] }),
    );
    expect(prompt).toContain('ATHLETE CONVERSATIONS');
    expect(prompt).toContain('I felt tired');
  });

  it('withholds them and says so when not shared', () => {
    const prompt = renderBriefingPrompt(ctx({ transcripts: null }));
    expect(prompt).toContain('has not shared their private Coach Chat');
  });
});

describe('buildBriefingContext — no direct identifier reaches the prompt (GDPR decision 1)', () => {
  it('throws when app-assembled material carries an email shape', () => {
    expect(() =>
      buildBriefingContext({
        today: '2026-08-08',
        plan: [{ ...plan[0], note: 'email me at coach@example.com' }],
        reports: null,
        transcripts: null,
      }),
    ).toThrow(/direct identifier/);
  });

  it('does not walk transcript free-text (the athlete\'s own words, as in Coach Chat)', () => {
    // An email an athlete typed into their own conversation is not an identifier
    // the app injected; it reaches the model exactly as it already does today.
    expect(() =>
      buildBriefingContext({
        today: '2026-08-08',
        plan,
        reports: null,
        transcripts: [{ kind: 'coach_chat', lines: ['Athlete: reach me at me@example.com'] }],
      }),
    ).not.toThrow();
  });

  it('passes clean material through', () => {
    const built = buildBriefingContext({ today: '2026-08-08', plan, reports, transcripts: null });
    expect(built.plan).toHaveLength(2);
    expect(built.reports).toBe(reports);
  });
});

describe('toBriefingReflection', () => {
  it('maps a stored 1–5 reflection onto the /10 axis', () => {
    const r = toBriefingReflection({
      date: '2026-08-04',
      type: 'Endurance',
      feedbackBody: 1,
      feedbackMind: 5,
      feedbackComment: null,
    });
    expect(r.body).toBe(1);
    expect(r.mind).toBe(10);
  });
});

describe('toBriefingApiMessages', () => {
  it('opens with the fixed primer and maps roles to user/assistant', () => {
    const transcript: Message[] = [
      { id: 'm0', role: 'coach_ai', content: 'Here is my read.', seq: 0, citations: [], createdAt: new Date() },
      { id: 'm1', role: 'head_coach', content: 'How is her sleep?', seq: 1, citations: [], createdAt: new Date() },
    ];
    expect(toBriefingApiMessages(transcript)).toEqual([
      { role: 'user', content: BRIEFING_OPENER },
      { role: 'assistant', content: 'Here is my read.' },
      { role: 'user', content: 'How is her sleep?' },
    ]);
  });
});

describe('renderBriefingPrompt — the races (training-architecture/09)', () => {
  const withRaces = (over: Partial<BriefingReports['profile']>) =>
    renderBriefingPrompt(ctx({ reports: { ...reports, profile: { ...reports.profile, ...over } } }));

  it('lists future races with target and tune-up markers', () => {
    const prompt = withRaces({
      races: [
        { name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false },
        { name: 'IM Copenhagen', date: '2027-08-15', distance: 'Full', isTarget: true },
      ],
    });
    expect(prompt).toContain('Races:');
    expect(prompt).toContain('- 2027-03-01 · Olympic Odense (Olympic) — tune-up');
    expect(prompt).toContain('- 2027-08-15 · IM Copenhagen (Full) — target');
    expect(prompt).not.toContain('No Target Race');
  });

  it('says No Target Race plainly when the athlete has nothing in the future to build toward', () => {
    // Mads, 2026-09-11: this is the "unplanned race" the glossary meant — the
    // Head Coach is told so they can raise it; the Coach never does unprompted.
    // Silence was the bug: `if (p.raceTarget)` omitted the subject entirely.
    const prompt = withRaces({ races: [], hasTargetRace: false, raceTarget: null });
    expect(prompt).toContain('No Target Race — nothing in the future to build toward; worth raising with the athlete');
  });

  it('says No Target Race for an athlete whose only races are in the past', () => {
    // The same data state as never having entered one: `getTargetRace` is null
    // for both, and the Head Coach conversation is the same either way.
    const prompt = withRaces({ races: [], hasTargetRace: false, raceTarget: 'IM Copenhagen 2025' });
    expect(prompt).toContain('No Target Race');
  });

  it('renders no race block at all when the target exists but the list is empty', () => {
    // A transient shape — the service always lists the target when it exists —
    // but the renderer must not invent a heading for nothing.
    const prompt = withRaces({ races: [], hasTargetRace: true });
    expect(prompt).not.toContain('Races:');
    expect(prompt).not.toContain('No Target Race');
    // Nothing at all between the lines on either side of where races would go.
    expect(prompt).toContain('- Race target: IM Copenhagen\n- Training sessions per week: 6');
  });

  it('never says No Target Race when a future target exists', () => {
    const prompt = withRaces({
      races: [{ name: 'IM Copenhagen', date: '2027-08-15', distance: 'Full', isTarget: true }],
      hasTargetRace: true,
    });
    expect(prompt).not.toContain('No Target Race');
  });
});

describe('briefingRaces — the race half of the profile', () => {
  const rows = [
    { name: 'Sprint Vejle', date: '2026-05-01', distance: 'Sprint', isTarget: false },
    { name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false },
    { name: 'IM Copenhagen', date: '2027-08-15', distance: 'Full', isTarget: true },
  ];

  it('keeps only the races ahead of today, in the order given', () => {
    expect(briefingRaces(rows, '2026-09-11').races.map((r) => r.name)).toEqual(['Olympic Odense', 'IM Copenhagen']);
  });

  it('a race on today is not ahead', () => {
    expect(briefingRaces([{ ...rows[2], date: '2026-09-11' }], '2026-09-11').races).toEqual([]);
  });

  it('has a target only while the target is ahead', () => {
    expect(briefingRaces(rows, '2026-09-11').hasTargetRace).toBe(true);
    expect(briefingRaces(rows, '2027-08-16').hasTargetRace).toBe(false);
    expect(briefingRaces([rows[1]], '2026-09-11').hasTargetRace).toBe(false);
  });
});
