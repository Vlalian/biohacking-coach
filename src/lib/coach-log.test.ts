import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logCoachFailure,
  logNarrationFailure,
  logBlockAdjustmentRefused,
  logBlockAdjustmentFailure,
  logWeekDraftFailure,
  logLookupFailure,
  logCoachDrift,
} from './coach-log';
import { EmptyCoachReplyError } from '@/features/coach/coach-client';

let written: string[] = [];

beforeEach(() => {
  written = [];
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    written.push(String(line));
  });
});
afterEach(() => vi.restoreAllMocks());

describe('logCoachFailure', () => {
  it('records which athlete, which conversation and why', async () => {
    // Without this, a tester whose Coach call failed is indistinguishable from
    // a tester who did not like it — both look like silence, and silence is the
    // one signal an unattended test cannot interpret.
    logCoachFailure({
      surface: 'coach_chat',
      athleteId: 'athlete_opaque_1',
      conversationId: 'conv_1',
      error: new Error('network down'),
    });

    expect(written).toHaveLength(1);
    const entry = JSON.parse(written[0]);
    expect(entry).toMatchObject({
      event: 'coach_call_failed',
      surface: 'coach_chat',
      athleteId: 'athlete_opaque_1',
      conversationId: 'conv_1',
      reason: 'coach-unavailable',
    });
  });

  it('carries the stop reason when the Coach returned an empty reply', () => {
    // This bug has been seen in the wild once (`fix/coach-empty-reply`), and
    // four times on Mads's smoke run of PR #71. The stop reason says which kind
    // of empty it was, and since 2026-09-17 a max_tokens empty is its own
    // refusal — the athlete is asked for less, not to send the same again.
    logCoachFailure({
      surface: 'weekly_session',
      athleteId: 'a1',
      conversationId: 'conv_2',
      error: new EmptyCoachReplyError('max_tokens'),
    });

    expect(JSON.parse(written[0])).toMatchObject({
      reason: 'ran-out-of-room',
      stopReason: 'max_tokens',
    });
  });

  it('tells refused content apart from an unreachable Coach', () => {
    // They need different responses — retrying refused content just fails
    // again — so the log has to preserve the distinction the athlete is shown.
    logCoachFailure({
      surface: 'coach_chat',
      athleteId: 'a1',
      conversationId: null,
      error: new Error('assertNoDirectIdentifier: identifier found'),
      reason: 'unsafe-content',
    });

    expect(JSON.parse(written[0]).reason).toBe('unsafe-content');
  });

  it('never writes a name, an email or the athlete\'s words', () => {
    // The log is read by a developer, and it is the one place an opaque id
    // could quietly stop being opaque (ADR 0006, GDPR decision 1).
    logCoachFailure({
      surface: 'coach_chat',
      athleteId: 'a1',
      conversationId: 'conv_1',
      error: new Error('failed for mads@example.com saying I slept badly'),
    });

    const line = written[0];
    expect(line).not.toContain('mads@example.com');
    expect(line).not.toContain('I slept badly');
  });

  it('never forwards a name written onto the error', () => {
    // CodeRabbit, PR #39. `Error.name` is writable, so reading it would reopen
    // the channel that dropping `error.message` was meant to close. The
    // classification comes from a closed list of constructors instead.
    const planted = new Error('boom');
    planted.name = 'mads@example.com';

    logCoachFailure({
      surface: 'coach_chat',
      athleteId: 'a1',
      conversationId: 'conv_1',
      error: planted,
    });

    const line = written[0];
    expect(line).not.toContain('mads@example.com');
    expect(JSON.parse(line).errorType).toBe('error');
  });

  it('still tells an empty reply apart from any other failure', () => {
    // The classification has to stay useful, or dropping detail has just made
    // the log worthless. This is the case that already bit once in the wild
    // (`fix/coach-empty-reply`).
    logCoachFailure({
      surface: 'coach_chat',
      athleteId: 'a1',
      conversationId: 'conv_1',
      error: new EmptyCoachReplyError('max_tokens'),
    });

    expect(JSON.parse(written[0]).errorType).toBe('empty_coach_reply');
  });

  it('never throws — a logger that fails must not fail the request', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('transport gone');
    });

    expect(() =>
      logCoachFailure({
        surface: 'coach_chat',
        athleteId: 'a1',
        conversationId: null,
        error: new Error('x'),
      }),
    ).not.toThrow();
  });
});

describe('errorType — a closed table, most specific first', () => {
  const spy = () => vi.spyOn(console, 'error').mockImplementation(() => {});
  const logged = (error: unknown) => {
    const s = spy();
    logNarrationFailure('a1', error);
    const line = JSON.parse(s.mock.calls[0][0] as string) as { errorType: string };
    s.mockRestore();
    return line.errorType;
  };

  it('names each known class, the generic Error, and the non-errors', () => {
    expect(logged(new EmptyCoachReplyError('max_tokens'))).toBe('empty_coach_reply');
    expect(logged(new TypeError('t'))).toBe('type_error');
    expect(logged(new SyntaxError('s'))).toBe('syntax_error');
    expect(logged(new RangeError('r'))).toBe('range_error');
    expect(logged(new Error('e'))).toBe('error');
    expect(logged(null)).toBe('null');
    expect(logged(undefined)).toBe('undefined');
    expect(logged('boom')).toBe('string');
    expect(logged({ code: 1 })).toBe('object');
  });
});

describe('the Training Block adjustment loggers (training-architecture/07)', () => {
  it('logs a refusal with its closed reason and the opaque athlete id', () => {
    const s = vi.spyOn(console, 'error').mockImplementation(() => {});
    logBlockAdjustmentRefused('a1', 'positional');
    expect(JSON.parse(s.mock.calls[0][0] as string)).toEqual({
      event: 'block_adjustment_refused',
      athleteId: 'a1',
      reason: 'positional',
    });
    s.mockRestore();
  });

  it('logs a failure with the error class, never its message', () => {
    const s = vi.spyOn(console, 'error').mockImplementation(() => {});
    logBlockAdjustmentFailure('a1', new TypeError('lars@example.com'));
    expect(JSON.parse(s.mock.calls[0][0] as string)).toEqual({
      event: 'block_adjustment_failed',
      athleteId: 'a1',
      errorType: 'type_error',
    });
    expect(s.mock.calls[0][0]).not.toContain('example.com');
    s.mockRestore();
  });

  it('never throws, even when console.error does', () => {
    const s = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console down');
    });
    expect(() => logBlockAdjustmentRefused('a1', 'short')).not.toThrow();
    expect(() => logBlockAdjustmentFailure('a1', new Error('x'))).not.toThrow();
    s.mockRestore();
  });
});

describe('logCoachFailure — the stop reason travels only when there is one', () => {
  it('carries stopReason for an empty reply that has one, and omits it otherwise', () => {
    const s = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = { surface: 'coach_chat' as const, athleteId: 'a1', conversationId: 'c1' };

    logCoachFailure({ ...base, error: new EmptyCoachReplyError('max_tokens') });
    expect(JSON.parse(s.mock.calls[0][0] as string)).toMatchObject({ stopReason: 'max_tokens' });

    logCoachFailure({ ...base, error: new EmptyCoachReplyError(null) });
    expect(JSON.parse(s.mock.calls[1][0] as string)).not.toHaveProperty('stopReason');

    logCoachFailure({ ...base, error: new Error('plain') });
    expect(JSON.parse(s.mock.calls[2][0] as string)).not.toHaveProperty('stopReason');
    s.mockRestore();
  });

  it('names the narration event on its own line', () => {
    const s = vi.spyOn(console, 'error').mockImplementation(() => {});
    logNarrationFailure('a1', new Error('x'));
    expect(JSON.parse(s.mock.calls[0][0] as string)).toEqual({
      event: 'narration_failed',
      athleteId: 'a1',
      errorType: 'error',
    });
    s.mockRestore();
  });
});

describe('logBlockAdjustmentRefused — the reason is a closed literal', () => {
  it('refuses a free string at the type level, so no reply text can be logged as a reason', () => {
    // @ts-expect-error — only a validator problem or 'malformed' is a reason.
    expect(() => logBlockAdjustmentRefused('a1', 'anything the model said')).not.toThrow();
    expect(() => logBlockAdjustmentRefused('a1', 'malformed')).not.toThrow();
  });
});


describe('logWeekDraftFailure — the after() boundary of the silent draft', () => {
  it('writes one structured line with the event, the opaque id and the error’s class — never its message', () => {
    // The module's contract (see the header): a driver error echoing the
    // INSERT it failed on would put the draft's payload — session notes —
    // into a log line. The class is what a debugger needs; the message is not.
    const s = vi.spyOn(console, 'error').mockImplementation(() => {});
    logWeekDraftFailure('a1', new Error('INSERT INTO events ... "note":"keep her sharp for Lars"'));
    expect(JSON.parse(s.mock.calls[0][0] as string)).toEqual({
      event: 'week_draft_failed',
      athleteId: 'a1',
      errorType: 'error',
    });
    expect(s.mock.calls[0][0]).not.toContain('Lars');
    logWeekDraftFailure('a1', 'plain string');
    expect(JSON.parse(s.mock.calls[1][0] as string)).toMatchObject({ errorType: 'string' });
    s.mockRestore();
  });

  it('never throws, even when console.error does', () => {
    const s = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('no console');
    });
    expect(() => logWeekDraftFailure('a1', new Error('x'))).not.toThrow();
    s.mockRestore();
  });
});

describe('logLookupFailure', () => {
  it('records a lookup that could not run, by surface and class, never by message', () => {
    // A retrieval outage completes the Coach turn ("lookup unavailable"), so
    // without this line it looks exactly like a turn with no lookup.
    logLookupFailure({
      surface: 'weekly_session',
      athleteId: 'athlete_opaque_1',
      conversationId: null,
      error: new Error('OPENAI_API_KEY is not set for mads@example.com'),
    });
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0])).toEqual({
      event: 'lookup_failed',
      surface: 'weekly_session',
      athleteId: 'athlete_opaque_1',
      conversationId: null,
      errorType: 'error',
    });
    expect(written[0]).not.toContain('mads@example.com');
  });
});

describe('logCoachDrift', () => {
  // Drift is a warning, not a failure: the turn completed, the athlete got an
  // answer. So it goes to console.warn, and the error capture above stays empty.
  let warned: string[] = [];
  beforeEach(() => {
    warned = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      warned.push(String(line));
    });
  });

  it('records a reply that mentioned its sources, by surface and pattern, as one structured line', () => {
    // The Coach is told never to cite; when it does anyway, the drift is
    // logged rather than corrected, so the prompt can be tuned from the log.
    logCoachDrift({
      surface: 'weekly_session',
      athleteId: 'athlete_opaque_1',
      conversationId: null,
      patterns: ['bracket-marker', 'according-to-study'],
    });
    expect(written).toHaveLength(0);
    expect(warned).toHaveLength(1);
    expect(JSON.parse(warned[0])).toEqual({
      event: 'coach_source_mention',
      surface: 'weekly_session',
      athleteId: 'athlete_opaque_1',
      conversationId: null,
      patterns: ['bracket-marker', 'according-to-study'],
    });
  });

  it('keeps the conversation id when the turn has one', () => {
    logCoachDrift({ surface: 'coach_chat', athleteId: 'a1', conversationId: 'conv_9', patterns: ['bracket-marker'] });
    expect(JSON.parse(warned[0])).toMatchObject({ surface: 'coach_chat', conversationId: 'conv_9' });
  });

  it('never throws, even when the console is broken', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('stdout closed');
    });
    expect(() =>
      logCoachDrift({ surface: 'coach_chat', athleteId: 'a1', conversationId: null, patterns: ['bracket-marker'] }),
    ).not.toThrow();
  });
});
