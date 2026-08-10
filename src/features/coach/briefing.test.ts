import { describe, it, expect } from 'vitest';
import {
  BRIEFING_OPENER,
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
      { id: 'm0', role: 'coach_ai', content: 'Here is my read.', seq: 0, createdAt: new Date() },
      { id: 'm1', role: 'head_coach', content: 'How is her sleep?', seq: 1, createdAt: new Date() },
    ];
    expect(toBriefingApiMessages(transcript)).toEqual([
      { role: 'user', content: BRIEFING_OPENER },
      { role: 'assistant', content: 'Here is my read.' },
      { role: 'user', content: 'How is her sleep?' },
    ]);
  });
});
