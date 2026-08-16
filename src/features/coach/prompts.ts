import type { EquipmentCategory, EquipmentItem } from '@/features/equipment/equipment';
import { assertNoDirectIdentifier } from './check-in';
import type {
  CheckIn,
  Onboarding,
  SessionContext,
  SessionHistoryItem,
  SkippedSession,
  WeekActivity,
  WeekFeedbackEntry,
} from './check-in';

/**
 * The Coach's prompt rendering, ported from the POC's `server.js` to a pure,
 * framework-free TypeScript module.
 *
 * Everything here is deterministic given its inputs: plain data in, prompt
 * strings out — no DB, no HTTP, no Anthropic client. The Express routing did not
 * port; the prompt logic did. The clock is the one seam to the outside world,
 * and it is passed in (`today`) rather than read here, so a prompt renders the
 * same on any machine at any time and tests need no mocking.
 *
 * No real identity ever reaches these strings: only the readiness scores, the
 * opaque profile, and an optional persona label. The check-in builder that feeds
 * this module is where GDPR decision 1 is enforced; this module simply never
 * asks for a name or an email.
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

/** The clock seam: an ISO date string (YYYY-MM-DD) for "today". */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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
      `pushed back on intensity sessions ${sleepIntensityPushbacks.length} times — always after sleeping under ${T.poorSleepHours} hours`,
    );
  }

  const pulsePushbacks = sessionHistory.filter(
    (s) => s.pulse !== undefined && s.pulse >= T.elevatedPulseBpm && s.pushedBack,
  );
  if (pulsePushbacks.length >= T.minOccurrences) {
    patterns.push(
      `pushed back on sessions ${pulsePushbacks.length} times when resting pulse was elevated above ${T.elevatedPulseBpm} bpm`,
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

// ── Onboarding & equipment lines ──────────────────────────────────────────────

const joinValue = (v: string | string[] | null | undefined): string =>
  Array.isArray(v) ? v.join(', ') : (v ?? '');

/**
 * Lines describing what the athlete already answered in the onboarding
 * questionnaire. Injected into every Coach prompt so the Coach builds on these
 * instead of re-asking.
 */
export function buildOnboardingLines(onboarding?: Onboarding | null): string[] {
  const lines: string[] = [];
  if (!onboarding) return lines;
  if (onboarding.sportBackground)
    lines.push(`Sport background: ${joinValue(onboarding.sportBackground)}`);
  if (onboarding.weeklyHours)
    lines.push(`Current weekly training hours: ${onboarding.weeklyHours}`);
  if (onboarding.motivation) lines.push(`Motivation: ${onboarding.motivation}`);
  if (onboarding.bestTime) lines.push(`Best Ironman time: ${onboarding.bestTime}`);
  if (onboarding.weakestDiscipline)
    lines.push(`Weakest discipline: ${joinValue(onboarding.weakestDiscipline)}`);
  if (onboarding.hasHumanCoach)
    lines.push(`Works with a human coach: ${onboarding.hasHumanCoach}`);
  if (onboarding.targetTime) lines.push(`Target time: ${onboarding.targetTime}`);
  if (onboarding.trackedMetrics)
    lines.push(`Tracks metrics: ${joinValue(onboarding.trackedMetrics)}`);
  return lines;
}

function renderOnboardingBlock(onboarding?: Onboarding | null): string {
  const lines = buildOnboardingLines(onboarding);
  if (lines.length === 0) return '';
  return `ONBOARDING PROFILE (athlete already answered these at onboarding — build on them, NEVER ask for this information again):
${lines.map((l) => `- ${l}`).join('\n')}

`;
}

const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  bike: 'Bike',
  shoes: 'Shoes',
  watch: 'Watch',
  other: 'Other',
};

export function buildEquipmentLines(equipment?: EquipmentItem[]): string[] {
  if (!equipment || equipment.length === 0) return [];
  return equipment.map((item) => {
    const detail = item.details ? ` — ${item.details}` : '';
    return `${EQUIPMENT_CATEGORY_LABEL[item.category]}: ${item.name}${detail}`;
  });
}

// ── Language directive ────────────────────────────────────────────────────────

const SPORTS_TERMS =
  'RPE, FTP, CSS, Zone 1-5, Ironman, 70.3, brick, tempo, threshold, VO2max, CTL, ATL, TSB, HRV, watts, TSS';

// The Coach appends these machine-readable signals on the last line; the app
// strips them before showing the message. Shared verbatim by the Weekly Session
// and Coach Chat prompts so the two can never drift.
const CONSTRAINT_SIGNALS = `CONSTRAINT SIGNALS (append on last line, stripped by app):
Specific date blocked → [UNAVAILABLE:YYYY-MM-DD]
Ambiguous ("can't do Tuesdays") → ask "just this week or every week?" first
Every [day] → [FIXED_CONSTRAINT_ADD:DayName]
Day unblocked → [FIXED_CONSTRAINT_REMOVE:DayName]
No justification needed.`;

/**
 * The Coach responds in the athlete's language, but technical sports terms stay
 * English (route: Athlete Language). Empty directive for English or unknown.
 */
export function languageDirective(language?: string): string {
  if (!language || language === 'English' || language === 'en') return '';
  if (language === 'Dansk' || language === 'da') {
    return `\nLANGUAGE: Respond in Danish. The following terms always stay in English: ${SPORTS_TERMS}.\n`;
  }
  return '';
}

// ── Weekly Session prompt ─────────────────────────────────────────────────────

const ORDINALS = ['', '1st', '2nd', '3rd'];
function ordinal(n: number): string {
  return ORDINALS[n] || `${n}th`;
}

const weekdayShort = (dateKey: string): string =>
  new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
  });

/**
 * Natural references for skipped sessions: date + type, with the position
 * qualifier ("2nd Endurance") only when two same-type sessions share a day.
 * Entity ids never appear in prompts.
 */
export function formatSkippedSessions(
  skippedSessions?: SkippedSession[],
): string | null {
  if (!skippedSessions || skippedSessions.length === 0) return null;
  return skippedSessions
    .map((s) => {
      const qualifier = s.position ? `${ordinal(s.position)} ` : '';
      return `${weekdayShort(s.date)} ${s.date}: ${qualifier}${s.sessionType}, skipped`;
    })
    .join('; ');
}

/**
 * The week's Session Moves and Athlete Session creations as natural references —
 * date + type, position qualifier only for same-type Doubles, never entity ids.
 * Silent Pattern Insight material for the Weekly Session.
 */
export function formatWeekActivity(weekActivity?: WeekActivity | null): string | null {
  if (!weekActivity) return null;
  const lines: string[] = [];
  (weekActivity.moves || []).forEach((m) => {
    const qualifier = m.position ? `${ordinal(m.position)} ` : '';
    lines.push(
      `- moved ${weekdayShort(m.from)} ${m.from} ${qualifier}${m.sessionType} to ${weekdayShort(m.to)} ${m.to}`,
    );
  });
  (weekActivity.creations || []).forEach((c) => {
    lines.push(
      `- added ${weekdayShort(c.dateKey)} ${c.dateKey} ${c.sessionType}${c.retro ? ' (retro-logged as done)' : ''}`,
    );
  });
  return lines.length > 0 ? lines.join('\n') : null;
}

const FEEDBACK_EMOJI = ['😫', '😕', '😐', '🙂', '😄'];
const emojiForScore = (val: number): string =>
  FEEDBACK_EMOJI[Math.round(((val - 1) * 4) / 9)] || '—';

export function formatWeekFeedback(
  weekFeedback?: WeekFeedbackEntry[],
): string | null {
  if (!weekFeedback || weekFeedback.length === 0) return null;
  return weekFeedback
    .map((entry) => {
      // Local midnight, like every other date helper here: a bare 'YYYY-MM-DD'
      // parses as UTC, which in any runtime behind UTC renders the previous
      // day — so the same date would show one weekday here and another in the
      // skipped/activity lines.
      const date = new Date(`${entry.dateKey}T00:00:00`);
      const dayName = date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const type = entry.sessionType || 'Training';
      const body = emojiForScore(entry.body);
      const mind = emojiForScore(entry.mind);
      const comment = entry.comment ? ` · "${entry.comment}"` : '';
      return `- ${dayName} · ${type} · Body ${body} (${entry.body}/10) · Mind ${mind} (${entry.mind}/10)${comment}`;
    })
    .join('\n');
}

export interface WeeklyContext {
  checkIn: CheckIn;
  patterns: string[];
  feedbackSummary: string | null;
  skippedSessions: SkippedSession[];
  unavailableDates: string[];
  weekActivityLines: string | null;
  today: string;
}

export function buildWeeklyContext(
  checkIn: CheckIn,
  weekFeedback: WeekFeedbackEntry[] = [],
  sessionHistory: SessionHistoryItem[] = [],
  skippedSessions: SkippedSession[] = [],
  unavailableDates: string[] = [],
  weekActivity: WeekActivity | null = null,
  today: string = todayISO(),
): WeeklyContext {
  return {
    checkIn,
    patterns: detectPatterns(sessionHistory),
    feedbackSummary: formatWeekFeedback(weekFeedback),
    skippedSessions,
    unavailableDates,
    weekActivityLines: formatWeekActivity(weekActivity),
    today,
  };
}

export function renderWeeklyPrompt(ctx: WeeklyContext): string {
  // Same reason as buildChatPrompt: the assertion belongs at the prompt builder,
  // so a caller that assembled the context itself cannot route around the one in
  // `buildWeeklyCheckIn`. Idempotent — asserting twice costs a walk, missing it
  // once costs an identifier reaching Anthropic.
  assertNoDirectIdentifier(ctx.checkIn);

  const {
    patterns,
    feedbackSummary,
    skippedSessions,
    unavailableDates,
    weekActivityLines,
    today,
  } = ctx;
  const {
    body,
    mental,
    energy,
    sleep,
    pulse,
    phase,
    commStyle,
    experienceLevel,
    sessionCount,
    language,
    weeklySessionDay,
    fixedConstraints,
    equipment,
    weeklySessionNumber,
    raceTarget,
    onboarding,
  } = ctx.checkIn;

  const equipmentLines = buildEquipmentLines(equipment);
  const hasEquipment = equipmentLines.length > 0;
  const onboardingBlock = renderOnboardingBlock(onboarding);

  const arc =
    weeklySessionNumber === 1
      ? `ARC — SESSION 1:

P1 WELCOME:
First meeting. Know athlete only from onboarding (name, race, experience, and the ONBOARDING PROFILE below). No history, feedback, patterns. Don't fake familiarity.
Don't ask "how did the week feel" — no week yet. Don't re-ask anything in ONBOARDING PROFILE — reference it as known. Welcome briefly, ask ONE physical state question: "Where are you right now physically — in rhythm or starting from scratch?" Wait.

P2 INTAKE:
Acknowledge what they say. Factor in injuries, gaps, fitness level. Brief. Only ask what onboarding didn't cover.

P3 FIRST WEEK:
Propose week. Explain reasoning more than usual — first exposure to coaching style. Name what you're building toward, not just sessions. "This is my starting point — does it fit?" Adjust. Close → see FIRST SESSION ORIENTATION.${raceTarget ? `\nRACE: ${raceTarget} — name once in P3 close (e.g. "This is your start toward [race]"). Not as greeting.` : ''}`
      : weeklySessionNumber === 2
        ? `ARC — SESSION 2:

P1 CHECK-IN:
One week history. Concrete debrief — not broad self-assessment. Ask: sessions, what felt hard, body response. 1-2 questions.

P2 REVIEW:
Acknowledge. Cross-ref feedback (may be sparse). Still building athlete picture — say so. Reference session 1 and onboarding. Name plan vs reality.

P3 PLANNING:
Build week 2 from week 1 learnings. Name connections: "legs heavy Thu → protect recovery earlier." Present sessions, ask if it works, adjust. Close with send-off, open door.`
        : weeklySessionNumber === 3
          ? `ARC — SESSION 3:

P1 OPENING:
Two weeks history — early relationship. Reference something specific from last session/feedback. Don't fake pattern knowledge. Ask: "Last week you mentioned X — how did that play out?"

P2 REVIEW:
Standard review, limited history caveat. Declare uncertainty. Two consistent weeks → "starting to notice a pattern."

P3 PLANNING:
Standard. Factor early patterns silently — surface only if 2+ weeks consistent.`
          : `ARC — SESSION 4+:

P1 REFLECTIVE PROMPT:
Ask 1-2 questions before giving your read. Pick most relevant: physical state, energy/sleep, mental load, perceived progress, health flags. Wait.

P2 WEEK REVIEW:
Acknowledge. Synthesise self-assessment + feedback + signals. Name patterns, strong sessions, warnings. Flag gaps between athlete self-read and data.

P3 PLANNING:
Lead with plan. Present sessions, load, reasoning. "Does that work, or anything needs moving?" Adjust. Close with send-off + open door.`;

  const dayOfWeek = new Date(today + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
  });
  const prefDay =
    weeklySessionDay && weeklySessionDay !== 'Flexible' ? weeklySessionDay : null;
  const onPrefDay = prefDay && dayOfWeek === prefDay;
  const planningDayLine =
    prefDay && !onPrefDay
      ? `PLANNING DAY: Preferred ${prefDay}, today ${dayOfWeek}. Ask: "Plan rest of this week or from next ${prefDay}?"\n`
      : '';

  return `You are Coach in a luxury Ironman training app.${languageDirective(language)} Weekly Session — primary structured conversation, once per week.

POSTURE: Confident, evidence-led, direct. Hold position unless athlete gives real reason. No markdown, lists, platitudes.

${arc}

TODAY: ${today}
${planningDayLine}${fixedConstraints && fixedConstraints.length > 0 ? `NO TRAINING ON: ${fixedConstraints.join(', ')}\n\n` : ''}${hasEquipment ? `EQUIPMENT:\n${equipmentLines.join('\n')}\n\n` : ''}STATE: phase=${phase} sessions=${sessionCount} body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm xp=${experienceLevel || 'intermediate'}
${onboardingBlock}${feedbackSummary ? `LAST WEEK FEEDBACK:\n${feedbackSummary}\n\n` : 'No feedback this week — use check-in signals and self-assessment.\n\n'}${commStyle ? `COMM STYLE: ${commStyle}\n\n` : ''}${
    patterns.length > 0
      ? `PATTERNS: ${patterns.join('; ')}.
Strong (multi-week) → surface ONE in P2: "I've noticed X, pretty common at this stage. Does that match?" Not data/criticism. Max one per session.
Weak → shape plan silently.\n\n`
      : ''
  }${skippedSessions && skippedSessions.length > 0 ? `SKIPPED: ${formatSkippedSessions(skippedSessions)} — mention naturally in review, no justification needed.\n\n` : ''}${unavailableDates && unavailableDates.length > 0 ? `UNAVAILABLE: ${unavailableDates.join(', ')} — no sessions, don't mention unless athlete raises it.\n\n` : ''}${
    weekActivityLines
      ? `WEEK ACTIVITY (silent background — the athlete arranged their own week. NEVER challenge or raise these in the moment; read them as Pattern Insight material only):
${weekActivityLines}

`
      : ''
  }DOUBLES: In planning you may propose two sessions on one day (e.g. a main session plus a short recovery block) when the athlete's phase and load genuinely call for it. Never forced — most days hold one session.

SAVING THE PLAN: Once the athlete has agreed to the week, call the propose_week_plan tool with every session dated (YYYY-MM-DD). This does NOT save — it shows the plan for the athlete to confirm or cancel. Call it only after agreement, never while still offering options, and only once. Omit rest days. Plan whatever range you agreed, from today onward.

${CONSTRAINT_SIGNALS}

DATA USE: Scores = coaching intelligence, never cite directly.
Low body/energy/mental → soften load. Poor sleep → recovery. High pulse → protect easy days. Strong feedback → validate. Mixed → name inconsistency.
${
    weeklySessionNumber === 1
      ? `
FIRST SESSION ORIENTATION:
After send-off, weave 3-4 sentences — coach orienting athlete, not product tour:
1. Training Plan tab — tap sessions to log body/mind; that's how I learn what works for you
2. Equipment tab — add gear for more specific advice
3. Glossary — unfamiliar terms, it's there
4. Coach Chat — "question mid-week? Find me in Coach Chat."
`
      : ''
  }${
    weeklySessionNumber !== undefined &&
    weeklySessionNumber >= 2 &&
    weeklySessionNumber <= 3 &&
    !hasEquipment
      ? `
EQUIPMENT NUDGE: One sentence in planning — don't know what they train on; Equipment tab helps you be specific. Once only.
`
      : ''
  }`;
}

// ── Coach Chat prompt ─────────────────────────────────────────────────────────

/**
 * The Coach Chat system prompt — the Coach Overlay's baseline mode (ADR 0007:
 * "Coach Chat, the Weekly Session, Session Negotiation, and the Reflective
 * Prompt become behaviors inside that one thread").
 *
 * `sessionContext` is the Reference the athlete brought in: the Session they
 * tapped "Discuss with Coach" on. It is resolved server-side from the session
 * id and passed here, never taken from the client — so the Coach discusses the
 * session the athlete actually owns. This is the only prompt that renders a
 * Reference: "discuss this session" is a behavior inside the one conversation,
 * not a mode of its own (CONTEXT.md, Session Negotiation, decided 2026-08-12).
 */
export function buildChatPrompt(
  checkIn: CheckIn,
  today: string = todayISO(),
  sessionContext: SessionContext | null = null,
): string {
  // Asserted here, at the prompt builder, because that is where AGENTS.md says
  // the assertion belongs — not only in `buildWeeklyCheckIn`. Both arguments are
  // covered: the check-in (whose equipment and onboarding answers are athlete
  // free text) and the Reference, which arrives separately and carries a session
  // note. Relying on the upstream builder left this reachable by any caller that
  // assembled a CheckIn itself.
  assertNoDirectIdentifier(checkIn);
  if (sessionContext) assertNoDirectIdentifier(sessionContext);

  const {
    body,
    mental,
    energy,
    sleep,
    pulse,
    phase,
    commStyle,
    experienceLevel,
    sessionCount,
    language,
    fixedConstraints,
    equipment,
    raceTarget,
    onboarding,
  } = checkIn;

  const equipmentLines = buildEquipmentLines(equipment);
  const onboardingBlock = renderOnboardingBlock(onboarding);

  return `You are Coach in a luxury Ironman training app.${languageDirective(language)} Coach Chat — on-demand open conversation. Training, nutrition, equipment, race logistics, mindset, injury, anything.

POSTURE: Confident, evidence-led, direct. Real conversation — respond to what they're asking. One follow-up if needed. Concise. No markdown, no lists unless athlete asks for breakdown.

TODAY: ${today}

CONTEXT (use silently — never cite scores/numbers):
phase=${phase} xp=${experienceLevel || 'intermediate'} sessions=${sessionCount} body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm${raceTarget ? ` race=${raceTarget}` : ''}${fixedConstraints && fixedConstraints.length > 0 ? ` no-train=${fixedConstraints.join(', ')}` : ''}${equipmentLines.length > 0 ? `\n\nEQUIPMENT:\n${equipmentLines.join('\n')}` : ''}

${onboardingBlock}${CONSTRAINT_SIGNALS}
${
    sessionContext
      ? `
SESSION DISCUSSION:
Athlete tapped a session from Training Plan. Engage directly.
Session: ${sessionContext.type} — ${sessionContext.dayLabel}
Duration: ${sessionContext.duration} · Zone: ${sessionContext.zone}
Note: "${sessionContext.note}"${sessionContext.status === 'skipped' ? '\nPreviously skipped.' : ''}
Walk through rationale in context of ${phase} phase.
`
      : ''
  }
${commStyle ? `COMM STYLE: ${commStyle}\n\n` : ''}PRIVACY: Never use athlete's name. Second person only. No PII reproduction.`;
}
