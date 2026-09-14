import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logCoachFailure, logNarrationFailure, logBlockAdjustmentRefused, logBlockAdjustmentFailure } from './coach-log';
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
    // This bug has been seen in the wild once (`fix/coach-empty-reply`). The
    // stop reason is the only thing that says which kind of empty it was.
    logCoachFailure({
      surface: 'weekly_session',
      athleteId: 'a1',
      conversationId: 'conv_2',
      error: new EmptyCoachReplyError('max_tokens'),
    });

    expect(JSON.parse(written[0])).toMatchObject({
      reason: 'coach-unavailable',
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
