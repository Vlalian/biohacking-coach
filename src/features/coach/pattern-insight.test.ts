import { describe, it, expect } from 'vitest';
import { detectPatterns } from './pattern-insight';
import type { SessionHistoryItem } from './check-in';

/**
 * Pattern Insight's detection rules.
 *
 * These went untested while they lived inside `prompts.ts` — reachable only
 * through a rendered prompt, which is a poor place to assert "three occurrences
 * declare a pattern, two do not". Splitting the module out made the unit
 * testable; this is that test.
 *
 * The threshold is the thing worth pinning. CONTEXT.md is explicit that a
 * pattern is only surfaced aloud when it is consistent across multiple weeks,
 * and that the Coach "does not over-react to single sessions" — so a rule that
 * fired one occurrence early would put a claim about the athlete's body in front
 * of them on thin evidence.
 */

const item = (over: Partial<SessionHistoryItem> = {}): SessionHistoryItem => ({
  sleep: 8,
  pulse: 50,
  pushedBack: false,
  sessionType: 'endurance',
  bodyFeedback: 7,
  mindFeedback: 7,
  ...over,
});

describe('detectPatterns', () => {
  it('finds nothing in an empty or too-short history', () => {
    expect(detectPatterns([])).toEqual([]);
    // Two occurrences of a genuine pattern still count as nothing: the whole
    // history is under the minimum, so detection does not even run.
    const shortSleepPushback = item({ sleep: 5, pushedBack: true, sessionType: 'intensity' });
    expect(detectPatterns([shortSleepPushback, shortSleepPushback])).toEqual([]);
  });

  it('declares a pattern at three occurrences, not two', () => {
    const hit = item({ sleep: 5, pushedBack: true, sessionType: 'intensity' });
    const filler = item();

    // Three of the pattern, padded so history length is never the limiting
    // factor — this isolates the per-rule threshold from the overall minimum.
    const two = detectPatterns([hit, hit, filler, filler]);
    expect(two).toEqual([]);

    const three = detectPatterns([hit, hit, hit, filler]);
    expect(three).toHaveLength(1);
    expect(three[0]).toContain('pushed back on intensity sessions 3 times');
  });

  it('reads elevated resting pulse alongside pushback', () => {
    const hit = item({ pulse: 70, pushedBack: true });
    const found = detectPatterns([hit, hit, hit]);
    expect(found.some((p) => p.includes('resting pulse was elevated'))).toBe(true);
  });

  it('correlates low mood with short sleep', () => {
    const hit = item({ sleep: 6, mindFeedback: 3 });
    const found = detectPatterns([hit, hit, hit]);
    expect(found.some((p) => p.includes('low post-session mood'))).toBe(true);
  });

  it('notices low body feedback in the session after an intensity session', () => {
    // Order matters for this one: it walks pairs, so the low-body session must
    // sit immediately after the intensity session, not merely somewhere near it.
    const intensity = item({ sessionType: 'intensity' });
    const flat = item({ bodyFeedback: 3 });
    const found = detectPatterns([intensity, flat, intensity, flat, intensity, flat]);
    expect(found.some((p) => p.includes('immediately after an intensity session'))).toBe(true);
  });

  it('does not fire the post-intensity rule when the low session comes first', () => {
    const intensity = item({ sessionType: 'intensity' });
    const flat = item({ bodyFeedback: 3 });
    const found = detectPatterns([flat, intensity, flat, intensity, flat, intensity]);
    // Two qualifying pairs at most in this ordering, which is under the minimum.
    expect(found.some((p) => p.includes('immediately after an intensity session'))).toBe(false);
  });

  it('ignores sessions whose signal is absent rather than treating it as zero', () => {
    // A missing `sleep` must not read as "slept 0 hours" and trip the rule.
    const noSleepRecorded = item({ sleep: undefined, pushedBack: true, sessionType: 'intensity' });
    expect(detectPatterns([noSleepRecorded, noSleepRecorded, noSleepRecorded])).toEqual([]);
  });
});
