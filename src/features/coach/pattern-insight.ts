import type { SessionHistoryItem } from './check-in';

/**
 * Pattern Insight — the Coach-detected cross-variable patterns that shape weekly
 * planning over time (CONTEXT.md).
 *
 * Pure and framework-free: session history in, plain-language pattern sentences
 * out. Split out of `prompts.ts` because detecting a pattern and rendering a
 * prompt are different jobs — this one is the Coach's reasoning, and it is worth
 * reading and testing without a prompt anywhere near it.
 *
 * Two modes, per CONTEXT.md: weak patterns shape the plan silently, strong ones
 * may be surfaced as an observation. This module only detects; the prompt decides
 * whether to speak.
 */

// Pattern detection thresholds.
//
// These are currently global constants — the same values apply to every athlete.
// This is a known limitation: individual baselines vary significantly (a veteran
// sleeping 5.5h may recover fully; a beginner at the same duration is genuinely
// impaired). A future enhancement should move these into the Athlete Profile so
// the Coach can calibrate thresholds per individual once enough history exists.
const PATTERN_THRESHOLDS = {
  poorSleepHours: 6, // nights below this flag as poor sleep for pattern detection
  lowSleepMoodHours: 6.5, // threshold for the mood/sleep correlation pattern
  elevatedPulseBpm: 65, // resting pulse at or above this is flagged as elevated
  lowFeedbackScore: 4, // body or mind feedback at or below this is "low"
  minOccurrences: 3, // minimum events needed before a pattern is declared
} as const;

export function detectPatterns(sessionHistory: SessionHistoryItem[]): string[] {
  const T = PATTERN_THRESHOLDS;
  if (!sessionHistory || sessionHistory.length < T.minOccurrences) return [];

  const patterns: string[] = [];

  const sleepIntensityPushbacks = sessionHistory.filter(
    (s) =>
      s.sleep !== undefined &&
      s.sleep < T.poorSleepHours &&
      s.pushedBack &&
      s.sessionType === 'intensity',
  );
  if (sleepIntensityPushbacks.length >= T.minOccurrences) {
    patterns.push(
      // Not "always": the filter counts sessions matching all three criteria and
      // says nothing about intensity sessions pushed back after good sleep. The
      // Coach shapes real coaching decisions on these sentences, so an
      // unjustified universal is not a wording nit.
      `pushed back on an intensity session ${sleepIntensityPushbacks.length} times after sleeping under ${T.poorSleepHours} hours`,
    );
  }

  const pulsePushbacks = sessionHistory.filter(
    (s) => s.pulse !== undefined && s.pulse >= T.elevatedPulseBpm && s.pushedBack,
  );
  if (pulsePushbacks.length >= T.minOccurrences) {
    patterns.push(
      // `>=`, so "at or above" — the threshold value itself is included.
      `pushed back on sessions ${pulsePushbacks.length} times when resting pulse was at or above ${T.elevatedPulseBpm} bpm`,
    );
  }

  const lowMindLowSleep = sessionHistory.filter(
    (s) =>
      s.sleep !== undefined &&
      s.sleep < T.lowSleepMoodHours &&
      s.mindFeedback !== undefined &&
      s.mindFeedback <= T.lowFeedbackScore,
  );
  if (lowMindLowSleep.length >= T.minOccurrences) {
    patterns.push(
      `reported low post-session mood ${lowMindLowSleep.length} times on days when sleep was under ${T.lowSleepMoodHours} hours`,
    );
  }

  let postIntensityLowBody = 0;
  for (let i = 1; i < sessionHistory.length; i++) {
    if (
      sessionHistory[i - 1].sessionType === 'intensity' &&
      sessionHistory[i].bodyFeedback !== undefined &&
      (sessionHistory[i].bodyFeedback as number) <= T.lowFeedbackScore
    ) {
      postIntensityLowBody++;
    }
  }
  if (postIntensityLowBody >= T.minOccurrences) {
    patterns.push(
      `reported low body feedback ${postIntensityLowBody} times in the session immediately after an intensity session`,
    );
  }

  return patterns;
}
