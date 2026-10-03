import { describe, it, expect } from 'vitest';
import { renderFeedbackReport, sinceFilter, type FeedbackReportInput, type ReportFeedbackRow } from './feedback-report';

/** No rows of any source; each test spreads it and names only the source it is about. */
const EMPTY: FeedbackReportInput = { interviews: [], feedback: [], thumbs: [], reflections: [] };

const at = (iso: string) => new Date(iso);

function row(overrides: Partial<ReportFeedbackRow> & Pick<ReportFeedbackRow, 'kind' | 'body'>): ReportFeedbackRow {
  return {
    athleteId: 'athlete_1',
    view: null,
    conversationId: null,
    coachFailureReason: null,
    createdAt: at('2026-09-20T10:00:00Z'),
    ...overrides,
    id: overrides.id ?? 'fb_0',
  };
}

const interview: FeedbackReportInput['interviews'][number] = {
  athleteId: 'athlete_1',
  conversationId: 'conv_1',
  startedAt: at('2026-09-20T09:00:00Z'),
  turns: [
    { role: 'athlete', content: 'The long run on Tuesday made no sense.', createdAt: at('2026-09-20T09:00:00Z'), seq: 1 },
    { role: 'coach_ai', content: 'Which session, and what did you do instead?', createdAt: at('2026-09-20T09:00:30Z'), seq: 2 },
    { role: 'athlete', content: 'I skipped it.\nRode easy instead.', createdAt: at('2026-09-20T09:01:00Z'), seq: 3 },
  ],
};

describe('renderFeedbackReport', () => {
  it('says plainly when nothing has been said yet', () => {
    const out = renderFeedbackReport({ ...EMPTY, interviews: [], feedback: [] });

    expect(out).toBe(
      'Feedback Interview readout — grouped by athlete, opaque ids only.\n\n' +
        'No feedback yet: no interview has been started and nothing has been submitted.',
    );
  });

  it('prints an interview in order, naming the speakers by role', () => {
    const out = renderFeedbackReport({ ...EMPTY, interviews: [interview], feedback: [] });

    const tester = out.indexOf('Tester:');
    const interviewer = out.indexOf('Interviewer:');
    expect(tester).toBeGreaterThan(-1);
    expect(interviewer).toBeGreaterThan(tester);
    expect(out).toContain('The long run on Tuesday made no sense.');
    expect(out).toContain('Which session, and what did you do instead?');
    // A multi-line turn stays a multi-line turn, indented under its speaker.
    expect(out).toContain('    I skipped it.\n    Rode easy instead.');
    // The interviewer is a role, never the Coach (ADR 0009).
    expect(out).not.toMatch(/\bCoach:/);
  });

  it('shows the Trust Signal beneath the interview it was asked in', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [interview],
      feedback: [
        row({
          kind: 'trust_signal',
          body: 'No — I would have skipped the long run anyway.',
          conversationId: 'conv_1',
        }),
      ],
    });

    const lastTurn = out.indexOf('Rode easy instead.');
    const signal = out.indexOf('Trust Signal');
    expect(signal).toBeGreaterThan(lastTurn);
    expect(out).toContain('No — I would have skipped the long run anyway.');
    expect(out).not.toContain('interview not found');
  });

  it('prints a fallback submission with the View it came from and why the Coach failed', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [],
      feedback: [
        row({
          kind: 'fallback',
          body: 'it just spins',
          view: '/training-plan',
          coachFailureReason: 'coach-unavailable',
        }),
      ],
    });

    expect(out).toContain('Fallback');
    expect(out).toContain('from /training-plan');
    expect(out).toContain('Coach failed: coach-unavailable');
    expect(out).toContain('    it just spins');
  });

  it('marks a fallback that simply chose the box, with no failure and no View', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [],
      feedback: [row({ kind: 'fallback', body: 'the plan page was blank all week' })],
    });

    expect(out).toContain('from an unknown View');
    expect(out).not.toContain('Coach failed');
  });

  it('never drops a Trust Signal whose interview is missing', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [],
      feedback: [row({ kind: 'trust_signal', body: 'yes', conversationId: 'conv_gone' })],
    });

    expect(out).toContain('interview not found');
    expect(out).toContain('    yes');
  });

  it('groups by athlete, by opaque id, in a stable order', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [{ ...interview, athleteId: 'athlete_b', conversationId: 'conv_b' }],
      feedback: [row({ kind: 'fallback', body: 'first', athleteId: 'athlete_a' })],
    });

    const a = out.indexOf('Athlete athlete_a');
    const b = out.indexOf('Athlete athlete_b');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    // The fallback belongs under athlete_a, the interview under athlete_b.
    expect(out.indexOf('first')).toBeLessThan(b);
    expect(out.indexOf('Tester:')).toBeGreaterThan(b);
  });

  it('prints what a tester typed as text, never as terminal control', () => {
    // A tester writes the body; a builder reads it in a terminal. An escape
    // sequence in it must show up as visible characters, not clear the screen
    // or recolour the lines around it. Line breaks and tabs stay what they are.
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [
        {
          ...interview,
          turns: [{ role: 'athlete', content: 'Hidden\u001b[2Jbelow\r\nnext\tline', createdAt: at('2026-09-20T09:00:00Z'), seq: 4 }],
        },
      ],
      feedback: [row({ kind: 'fallback', body: 'bell\u0007here', coachFailureReason: 'x\u001b]0;t\u0007' })],
    });

    // oxlint-disable-next-line no-control-regex -- asserting their absence is the point
    expect(out).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    expect(out).toContain('Hidden\\x1b[2Jbelow');
    expect(out).toContain('    next\tline');
    expect(out).toContain('bell\\x07here');
  });

  it('prints the ledger key the review skill uses on every interview, fallback and Trust Signal', () => {
    // `/feedback-review` keeps a ledger keyed exactly like this, so a row it
    // has read once is never read again (showable-version/48).
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [interview],
      feedback: [
        row({ id: 'fb_1', kind: 'fallback', body: 'x' }),
        row({ id: 'fb_2', kind: 'trust_signal', body: 'no', conversationId: 'conv_1' }),
        row({ id: 'fb_3', kind: 'trust_signal', body: 'orphan', athleteId: 'athlete_2', conversationId: 'gone' }),
      ],
    });

    expect(out).toContain('[interview:conv_1:3]');
    expect(out).toContain('[fallback:fb_1]');
    expect(out).toContain('[trust:athlete_1]');
    expect(out).toContain('[trust:athlete_2]');
  });

  it('prints a thumbs rating with its comment and the Momentum message it pins', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      thumbs: [{ athleteId: 'athlete_1', messageId: 'msg_9', rating: 'down', comment: 'too long', messageText: 'Swim 3 km easy.', updatedAt: at('2026-09-30T08:00:00Z') }],
    });

    expect(out).toContain('Athlete athlete_1');
    expect(out).toContain('[thumb:msg_9:2026-09-30T08:00:00.000Z]');
    expect(out).toMatch(/Thumbs down \(2026-09-30 08:00\): too long/);
    expect(out).toContain('    Swim 3 km easy.');
  });

  it('prints a Session Reflection comment with its session, date, type and both ratings', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      reflections: [{ athleteId: 'athlete_1', sessionId: 'ses_4', date: '2026-09-28', type: 'Endurance', body: 2, mind: 4, comment: 'legs heavy', ratedAt: at('2026-09-28T19:00:00Z') }],
    });

    expect(out).toContain('[reflection:ses_4]');
    expect(out).toContain('Reflection on 2026-09-28 Endurance (Body 2/5, Mind 4/5):');
    expect(out).toContain('    legs heavy');
  });

  it('marks a rating the athlete left blank, rather than printing null', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      reflections: [{ athleteId: 'a', sessionId: 's', date: '2026-09-28', type: 'Endurance', body: null, mind: 3, comment: 'ok', ratedAt: at('2026-09-28T19:00:00Z') }],
    });
    expect(out).toContain('(Body –/5, Mind 3/5)');
  });

  it('prints control characters in thumbs and reflections as text', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      thumbs: [{ athleteId: 'a', messageId: 'm', rating: 'up', comment: 'x\u001b[2J', messageText: 'ok\u0007', updatedAt: at('2026-09-30T08:00:00Z') }],
      reflections: [{ athleteId: 'a', sessionId: 's', date: '2026-09-28', type: 'Endurance', body: 3, mind: 3, comment: 'y\u001b[1m', ratedAt: at('2026-09-28T19:00:00Z') }],
    });
    expect(out).toContain('x\\x1b[2J');
    expect(out).toContain('ok\\x07');
    expect(out).toContain('y\\x1b[1m');
  });

  it('closes with the counts, every source among them', () => {
    const out = renderFeedbackReport({ ...EMPTY,
      interviews: [interview],
      feedback: [
        row({ kind: 'trust_signal', body: 'no', conversationId: 'conv_1' }),
        row({ kind: 'fallback', body: 'x', athleteId: 'athlete_2' }),
      ],
      thumbs: [{ athleteId: 'athlete_3', messageId: 'm', rating: 'up', comment: null, messageText: 'ok', updatedAt: at('2026-09-30T08:00:00Z') }],
      reflections: [{ athleteId: 'athlete_1', sessionId: 's', date: '2026-09-28', type: 'Endurance', body: 3, mind: 3, comment: 'ok', ratedAt: at('2026-09-28T19:00:00Z') }],
    });

    expect(out.trimEnd().split('\n').at(-1)).toBe(
      '3 athlete(s), 1 interview(s), 1 Trust Signal answer(s), 1 fallback submission(s), 1 thumbs rating(s), 1 reflection comment(s).',
    );
  });
});

describe('sinceFilter — npm run feedback -- --since', () => {
  const since = at('2026-09-29T00:00:00Z');
  const thumb = { athleteId: 'a', messageId: 'm', rating: 'up' as const, comment: null, messageText: 'ok', updatedAt: at('2026-09-30T00:00:00Z') };
  const reflection = { athleteId: 'a', sessionId: 's', date: '2026-09-28', type: 'Endurance', body: 3, mind: 3, comment: 'ok', ratedAt: at('2026-09-01T00:00:00Z') };

  it('keeps only what was written on or after the date, by each source’s own timestamp', () => {
    const out = sinceFilter({
      interviews: [interview], // every turn on 2026-09-20
      feedback: [row({ id: 'old', kind: 'fallback', body: 'x', createdAt: at('2026-09-28T23:59:00Z') }), row({ id: 'new', kind: 'fallback', body: 'y', createdAt: since })],
      thumbs: [thumb, { ...thumb, messageId: 'old', updatedAt: at('2026-09-28T23:59:59Z') }],
      reflections: [reflection, { ...reflection, sessionId: 'on-the-day', ratedAt: since }],
    }, since);

    expect(out.interviews).toEqual([]);
    expect(out.feedback.map((f) => f.id)).toEqual(['new']);
    expect(out.thumbs.map((t) => t.messageId)).toEqual(['m']);
    expect(out.reflections.map((r) => r.sessionId)).toEqual(['on-the-day']);
  });

  it('keeps an interview with only its turns from the date on, so its key names the last new turn', () => {
    const resumed = { ...interview, turns: [...interview.turns, { role: 'athlete' as const, content: 'One more thing.', createdAt: since, seq: 4 }] };
    const out = sinceFilter({ ...EMPTY, interviews: [resumed] }, since);

    expect(out.interviews).toHaveLength(1);
    expect(out.interviews[0].turns.map((t) => t.seq)).toEqual([4]);
  });
});

describe('renderFeedbackReport — the whole readout, exactly', () => {
  it('lays out every source per athlete in time order, whatever order the rows arrive in', () => {
    const t = (iso: string) => at(`2026-09-${iso}Z`);
    const out = renderFeedbackReport({
      interviews: [
        { athleteId: 'athlete_b', conversationId: 'conv_late', startedAt: t('22T10:00:00'), turns: [{ role: 'athlete', content: 'later', createdAt: t('22T10:00:00'), seq: 7 }] },
        { athleteId: 'athlete_b', conversationId: 'conv_early', startedAt: t('21T10:00:00'), turns: [] },
      ],
      feedback: [
        row({ id: 'fb_late', athleteId: 'athlete_b', kind: 'fallback', body: 'second', view: '/calendar', coachFailureReason: 'coach-unavailable', createdAt: t('23T09:00:00') }),
        row({ id: 'fb_early', athleteId: 'athlete_b', kind: 'fallback', body: 'first', createdAt: t('20T09:00:00') }),
        row({ id: 'ts_late', athleteId: 'athlete_b', kind: 'trust_signal', body: 'yes', conversationId: 'conv_late', createdAt: t('22T10:05:00') }),
        row({ id: 'ts_orphan', athleteId: 'athlete_b', kind: 'trust_signal', body: 'lost', conversationId: null, createdAt: t('19T09:00:00') }),
        row({ id: 'fb_a', athleteId: 'athlete_a', kind: 'fallback', body: 'from a', createdAt: t('24T09:00:00') }),
      ],
      thumbs: [
        { athleteId: 'athlete_b', messageId: 'm2', rating: 'up', comment: null, messageText: 'Good call.', updatedAt: t('25T08:00:00') },
        { athleteId: 'athlete_b', messageId: 'm1', rating: 'down', comment: 'too long', messageText: 'Swim 3 km.', updatedAt: t('24T08:00:00') },
      ],
      reflections: [
        { athleteId: 'athlete_b', sessionId: 's2', date: '2026-09-27', type: 'Tempo', body: 3, mind: 4, comment: 'hard', ratedAt: t('27T19:00:00') },
        { athleteId: 'athlete_b', sessionId: 's1', date: '2026-09-26', type: 'Endurance', body: 4, mind: 4, comment: 'fine', ratedAt: t('26T19:00:00') },
      ],
    });

    // Read line by line on 2026-10-03: athletes by id, each source oldest first
    // by its own date, the empty interview keyed :0, the Trust Signal under the
    // interview it was asked in, the orphan marked.
    expect(out).toBe(
      [
        "Feedback Interview readout — grouped by athlete, opaque ids only.",
        "",
        "Athlete athlete_a",
        '-'.repeat(90),
        "  Fallback (2026-09-24 09:00, from an unknown View): [fallback:fb_a]",
        "    from a",
        "",
        "Athlete athlete_b",
        '-'.repeat(90),
        "  Interview conv_early — started 2026-09-21 10:00, 0 turn(s) [interview:conv_early:0]",
        "  Interview conv_late — started 2026-09-22 10:00, 1 turn(s) [interview:conv_late:7]",
        "  [2026-09-22 10:00] Tester:",
        "    later",
        "  Trust Signal (2026-09-22 10:05): [trust:athlete_b]",
        "    yes",
        "  Fallback (2026-09-20 09:00, from an unknown View): [fallback:fb_early]",
        "    first",
        "  Fallback (2026-09-23 09:00, from /calendar, Coach failed: coach-unavailable): [fallback:fb_late]",
        "    second",
        "  Trust Signal (2026-09-19 09:00, interview not found): [trust:athlete_b]",
        "    lost",
        "  Thumbs down (2026-09-24 08:00): too long [thumb:m1:2026-09-24T08:00:00.000Z]",
        "    Swim 3 km.",
        "  Thumbs up (2026-09-25 08:00) [thumb:m2:2026-09-25T08:00:00.000Z]",
        "    Good call.",
        "  Reflection on 2026-09-26 Endurance (Body 4/5, Mind 4/5): [reflection:s1]",
        "    fine",
        "  Reflection on 2026-09-27 Tempo (Body 3/5, Mind 4/5): [reflection:s2]",
        "    hard",
        "",
        "2 athlete(s), 2 interview(s), 2 Trust Signal answer(s), 3 fallback submission(s), 2 thumbs rating(s), 2 reflection comment(s).",
      ].join('\n'),
    );
  });
});
