import { detectPatterns } from './pattern-insight';
import {
  CONSTRAINT_SIGNALS,
  assemble,
  commStyleBlock,
  equipmentBlock,
  onboardingBlock,
  openingBlock,
  buildEquipmentLines,
  type PromptBlock,
} from './prompt-blocks';
import { assertNoDirectIdentifier } from './check-in';
import type {
  CheckIn,
  Readiness,
  SessionContext,
  SessionHistoryItem,
  SkippedSession,
  WeekActivity,
  WeekFeedbackEntry,
} from './check-in';

/**
 * The Coach's athlete-facing prompts: the Weekly Session and Coach Chat.
 *
 * Everything here is deterministic given its inputs — plain data in, prompt
 * strings out, no DB, no HTTP, no Anthropic client. The clock is the one seam to
 * the outside world and it is passed in (`today`) rather than read here, so a
 * prompt renders the same on any machine at any time and tests need no mocking.
 *
 * No real identity ever reaches these strings. The check-in builder that feeds
 * this module enforces GDPR decision 1, and both renderers assert it again
 * themselves so a caller that assembled its own context cannot route around it.
 *
 * How a prompt is *assembled* lives in `prompt-blocks`; what the Coach notices
 * across weeks lives in `pattern-insight`. This module is the copy and the order.
 */

/** The clock seam: an ISO date string (YYYY-MM-DD) for "today". */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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

// ── Weekly Session blocks ─────────────────────────────────────────────────────

const ARC_SESSION_1 = `ARC — SESSION 1:

P1 WELCOME:
First meeting. Know athlete only from onboarding (name, race, experience, and the ONBOARDING PROFILE below). No history, feedback, patterns. Don't fake familiarity.
Don't ask "how did the week feel" — no week yet. Don't re-ask anything in ONBOARDING PROFILE — reference it as known. Welcome briefly, ask ONE physical state question: "Where are you right now physically — in rhythm or starting from scratch?" Wait.

P2 INTAKE:
Acknowledge what they say. Factor in injuries, gaps, fitness level. Brief. Only ask what onboarding didn't cover.

P3 FIRST WEEK:
Propose week. Explain reasoning more than usual — first exposure to coaching style. Name what you're building toward, not just sessions. "This is my starting point — does it fit?" Adjust. Close → see FIRST SESSION ORIENTATION.`;

const ARC_SESSION_2 = `ARC — SESSION 2:

P1 CHECK-IN:
One week history. Concrete debrief — not broad self-assessment. Ask: sessions, what felt hard, body response. 1-2 questions.

P2 REVIEW:
Acknowledge. Cross-ref feedback (may be sparse). Still building athlete picture — say so. Reference session 1 and onboarding. Name plan vs reality.

P3 PLANNING:
Build week 2 from week 1 learnings. Name connections: "legs heavy Thu → protect recovery earlier." Present sessions, ask if it works, adjust. Close with send-off, open door.`;

const ARC_SESSION_3 = `ARC — SESSION 3:

P1 OPENING:
Two weeks history — early relationship. Reference something specific from last session/feedback. Don't fake pattern knowledge. Ask: "Last week you mentioned X — how did that play out?"

P2 REVIEW:
Standard review, limited history caveat. Declare uncertainty. Two consistent weeks → "starting to notice a pattern."

P3 PLANNING:
Standard. Factor early patterns silently — surface only if 2+ weeks consistent.`;

const ARC_SESSION_4_PLUS = `ARC — SESSION 4+:

P1 REFLECTIVE PROMPT:
Ask 1-2 questions before giving your read. Pick most relevant: physical state, energy/sleep, mental load, perceived progress, health flags. Wait.

P2 WEEK REVIEW:
Acknowledge. Synthesise self-assessment + feedback + signals. Name patterns, strong sessions, warnings. Flag gaps between athlete self-read and data.

P3 PLANNING:
Lead with plan. Present sessions, load, reasoning. "Does that work, or anything needs moving?" Adjust. Close with send-off + open door.`;

/**
 * The Presence Arc, as the Coach's instructions for this week's conversation
 * (CONTEXT.md — Weeks 1, 2, 3, then 4+). The arc is earned, not simulated: each
 * stage tells the Coach exactly how much history it may claim to have.
 *
 * The race target rides on session 1 only, where it belongs to the P3 close.
 */
function arcBlock(
  weeklySessionNumber: number | undefined,
  raceTarget?: string | null,
): string {
  if (weeklySessionNumber === 1) {
    const race = raceTarget
      ? `\nRACE: ${raceTarget} — name once in P3 close (e.g. "This is your start toward [race]"). Not as greeting.`
      : '';
    return `${ARC_SESSION_1}${race}`;
  }
  if (weeklySessionNumber === 2) return ARC_SESSION_2;
  if (weeklySessionNumber === 3) return ARC_SESSION_3;
  return ARC_SESSION_4_PLUS;
}

/**
 * Today, the Weekly Session Day question, and the athlete's Fixed Constraints —
 * the three facts about *when* that the Coach plans around.
 *
 * Starting the Weekly Session on the preferred day plans the week ahead without
 * asking; on any other day the Coach asks which week it is planning (CONTEXT.md,
 * Weekly Session Day).
 */
function todayBlock(
  today: string,
  weeklySessionDay?: string,
  fixedConstraints?: string[],
): string {
  const lines = [`TODAY: ${today}`];

  const dayOfWeek = new Date(today + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
  });
  const prefDay =
    weeklySessionDay && weeklySessionDay !== 'Flexible' ? weeklySessionDay : null;
  if (prefDay && dayOfWeek !== prefDay) {
    lines.push(
      `PLANNING DAY: Preferred ${prefDay}, today ${dayOfWeek}. Ask: "Plan rest of this week or from next ${prefDay}?"`,
    );
  }

  if (fixedConstraints && fixedConstraints.length > 0) {
    lines.push(`NO TRAINING ON: ${fixedConstraints.join(', ')}`);
  }

  return lines.join('\n');
}

/** The readiness scores as prompt text, or '' when the athlete never gave any. */
function readinessFragment(readiness?: Readiness): string {
  if (!readiness) return '';
  const { body, mental, energy, sleep, pulse } = readiness;
  return ` body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm`;
}

/**
 * What the Coach is told when it has no Check-in to reason from.
 *
 * The prompts instruct the Coach to read these scores as coaching intelligence,
 * so with none present it must be told that plainly and told to ask — which is
 * what the Presence Arc's P1 already has it doing. Without this the Coach is left
 * to infer a state from silence, which is the same failure the invented baseline
 * caused, arrived at differently (code-health/07).
 */
const NO_CHECK_IN = `NO CHECK-IN DATA: You have no check-in scores for this athlete — no body, mental, energy, sleep or resting-pulse figures. Do not infer them, and never imply you can see how they slept or recovered. Ask, and coach from what they tell you in words.`;

/** The STATE line — coaching intelligence, never quoted back to the athlete. */
function stateBlock(s: {
  phase?: string;
  sessionCount?: number;
  experienceLevel?: string;
  readiness?: Readiness;
}): string {
  return `STATE: phase=${s.phase} sessions=${s.sessionCount}${readinessFragment(s.readiness)} xp=${s.experienceLevel || 'intermediate'}`;
}

/**
 * How the Coach is told to weigh what it has.
 *
 * The readiness half is instructions for reading numbers; with no numbers to read
 * it is not merely useless, it invites the Coach to act as though it had them.
 * The Session Reflection half is real data either way and stays.
 */
function dataUseBlock(readiness?: Readiness): string {
  if (readiness) {
    return `DATA USE: Scores = coaching intelligence, never cite directly.
Low body/energy/mental → soften load. Poor sleep → recovery. High pulse → protect easy days. Strong feedback → validate. Mixed → name inconsistency.`;
  }
  return `DATA USE: Session Reflections = coaching intelligence, never cite directly.
Strong feedback → validate. Mixed → name inconsistency. What the athlete tells you in words about body, sleep and energy is your only read on those — weigh it as such.`;
}

/**
 * Last week's Session Reflections, or what to do without them.
 *
 * The no-feedback line used to send the Coach to "check-in signals", which was
 * written when a check-in was always sent — with none, it points the Coach at
 * data it does not have.
 */
function lastWeekFeedbackBlock(
  feedbackSummary: string | null,
  readiness?: Readiness,
): string {
  if (feedbackSummary) return `LAST WEEK FEEDBACK:
${feedbackSummary}`;
  if (readiness) return 'No feedback this week — use check-in signals and self-assessment.';
  return 'No feedback this week, and no check-in data — go on what the athlete tells you.';
}

/** Pattern Insight: surfaced at most once, and only when multi-week consistent. */
function patternsBlock(patterns: string[]): PromptBlock {
  if (patterns.length === 0) return null;
  return `PATTERNS: ${patterns.join('; ')}.
Strong (multi-week) → surface ONE in P2: "I've noticed X, pretty common at this stage. Does that match?" Not data/criticism. Max one per session.
Weak → shape plan silently.`;
}

const FIRST_SESSION_ORIENTATION = `FIRST SESSION ORIENTATION:
After send-off, weave 3-4 sentences — coach orienting athlete, not product tour:
1. Training Plan tab — tap sessions to log body/mind; that's how I learn what works for you
2. Equipment tab — add gear for more specific advice
3. Glossary — unfamiliar terms, it's there
4. Coach Chat — "question mid-week? Find me in Coach Chat."`;

const EQUIPMENT_NUDGE = `EQUIPMENT NUDGE: One sentence in planning — don't know what they train on; Equipment tab helps you be specific. Once only.`;


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
    readiness,
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


  return assemble([
    openingBlock(language, 'Weekly Session — primary structured conversation, once per week.'),

    'POSTURE: Confident, evidence-led, direct. Hold position unless athlete gives real reason. No markdown, lists, platitudes.',

    arcBlock(weeklySessionNumber, raceTarget),

    todayBlock(today, weeklySessionDay, fixedConstraints),

    equipmentBlock(equipmentLines),

    stateBlock({ phase, sessionCount, experienceLevel, readiness }),

    readiness ? null : NO_CHECK_IN,

    onboardingBlock(onboarding),

    lastWeekFeedbackBlock(feedbackSummary, readiness),

    commStyleBlock(commStyle),

    patternsBlock(patterns),

    skippedSessions && skippedSessions.length > 0
      ? `SKIPPED: ${formatSkippedSessions(skippedSessions)} — mention naturally in review, no justification needed.`
      : null,

    unavailableDates && unavailableDates.length > 0
      ? `UNAVAILABLE: ${unavailableDates.join(', ')} — no sessions, don't mention unless athlete raises it.`
      : null,

    weekActivityLines
      ? `WEEK ACTIVITY (silent background — the athlete arranged their own week. NEVER challenge or raise these in the moment; read them as Pattern Insight material only):\n${weekActivityLines}`
      : null,

    "DOUBLES: In planning you may propose two sessions on one day (e.g. a main session plus a short recovery block) when the athlete's phase and load genuinely call for it. Never forced — most days hold one session.",

    'SAVING THE PLAN: Once the athlete has agreed to the week, call the propose_week_plan tool with every session dated (YYYY-MM-DD). This does NOT save — it shows the plan for the athlete to confirm or cancel. Call it only after agreement, never while still offering options, and only once. Omit rest days. Plan whatever range you agreed, from today onward.',

    CONSTRAINT_SIGNALS,

    dataUseBlock(readiness),

    // The Guided Tour's first beat, delivered in the Coach's voice at the one
    // moment the athlete is oriented — never as a UI overlay (ADR 0001).
    weeklySessionNumber === 1 ? FIRST_SESSION_ORIENTATION : null,

    // Sessions 2-3 only, and only while the Equipment tab is still empty.
    weeklySessionNumber !== undefined &&
    weeklySessionNumber >= 2 &&
    weeklySessionNumber <= 3 &&
    !hasEquipment
      ? EQUIPMENT_NUDGE
      : null,
  ]);
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
    readiness,
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

  const race = raceTarget ? ` race=${raceTarget}` : '';
  const noTrain =
    fixedConstraints && fixedConstraints.length > 0
      ? ` no-train=${fixedConstraints.join(', ')}`
      : '';

  return assemble([
    openingBlock(
      language,
      'Coach Chat — on-demand open conversation. Training, nutrition, equipment, race logistics, mindset, injury, anything.',
    ),

    "POSTURE: Confident, evidence-led, direct. Real conversation — respond to what they're asking. One follow-up if needed. Concise. No markdown, no lists unless athlete asks for breakdown.",

    `TODAY: ${today}`,

    `CONTEXT (use silently — never cite scores/numbers):
phase=${phase} xp=${experienceLevel || 'intermediate'} sessions=${sessionCount}${readinessFragment(readiness)}${race}${noTrain}`,

    readiness ? null : NO_CHECK_IN,

    equipmentBlock(buildEquipmentLines(equipment)),

    onboardingBlock(onboarding),

    CONSTRAINT_SIGNALS,

    referenceBlock(sessionContext, phase),

    commStyleBlock(commStyle),

    "PRIVACY: Never use athlete's name. Second person only. No PII reproduction.",
  ]);
}

/**
 * The Reference the athlete brought into the thread — the Session they tapped
 * "Discuss with Coach" on (CONTEXT.md, Reference).
 *
 * Discussing a session is a *behavior* inside the one conversation, not a mode
 * of its own: this block is what makes "I want to change this session" answerable
 * without a separate Session Negotiation surface (decided 2026-08-12).
 */
function referenceBlock(
  sessionContext: SessionContext | null,
  phase?: string,
): PromptBlock {
  if (!sessionContext) return null;
  const skipped = sessionContext.status === 'skipped' ? '\nPreviously skipped.' : '';
  return `SESSION DISCUSSION:
Athlete tapped a session from Training Plan. Engage directly.
Session: ${sessionContext.type} — ${sessionContext.dayLabel}
Duration: ${sessionContext.duration} · Zone: ${sessionContext.zone}
Note: "${sessionContext.note}"${skipped}
Walk through rationale in context of ${phase} phase.`;
}
