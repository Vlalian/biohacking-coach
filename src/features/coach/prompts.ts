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
import type { SessionOrigin } from '@/features/session/session';
import type { WeekSession } from './week';
import type {
  CheckIn,
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
 * A day as every prompt names one: 'Mon 2026-08-17'.
 *
 * The weekday is redundant with the ISO date and carried anyway — the model
 * reasons about "tomorrow" and "the weekend" far more reliably when it does not
 * have to derive the weekday itself.
 */
const dayReference = (dateKey: string): string => `${weekdayShort(dateKey)} ${dateKey}`;

/**
 * A Session Type with its Double qualifier, when it has one: '2nd Endurance'.
 *
 * Shared by every formatter below because the rule is one rule (CONTEXT.md,
 * Week Activity): the qualifier appears only for same-type Doubles, since that
 * is the single case where a day and a type do not identify a session.
 */
const qualifiedType = (sessionType: string, position?: number): string =>
  `${position ? `${ordinal(position)} ` : ''}${sessionType}`;

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
      return `${dayReference(s.date)}: ${qualifiedType(s.sessionType, s.position)}, skipped`;
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
    lines.push(
      `- moved ${dayReference(m.from)} ${qualifiedType(m.sessionType, m.position)} to ${dayReference(m.to)}`,
    );
  });
  (weekActivity.creations || []).forEach((c) => {
    lines.push(
      `- added ${dayReference(c.dateKey)} ${c.sessionType}${c.retro ? ' (retro-logged as done)' : ''}`,
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

/** The readiness STATE line — coaching intelligence, never quoted back to the athlete. */
function stateBlock(s: {
  phase?: string;
  sessionCount?: number;
  body: number;
  mental: number;
  energy: number;
  sleep: number;
  pulse: number;
  experienceLevel?: string;
}): string {
  return `STATE: phase=${s.phase} sessions=${s.sessionCount} body=${s.body}/10 mental=${s.mental}/10 energy=${s.energy}/10 sleep=${s.sleep}h pulse=${s.pulse}bpm xp=${s.experienceLevel || 'intermediate'}`;
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

  return assemble([
    openingBlock(language, 'Weekly Session — primary structured conversation, once per week.'),

    'POSTURE: Confident, evidence-led, direct. Hold position unless athlete gives real reason. No markdown, lists, platitudes.',

    arcBlock(weeklySessionNumber, raceTarget),

    todayBlock(today, weeklySessionDay, fixedConstraints),

    equipmentBlock(equipmentLines),

    stateBlock({ phase, sessionCount, body, mental, energy, sleep, pulse, experienceLevel }),

    onboardingBlock(onboarding),

    feedbackSummary
      ? `LAST WEEK FEEDBACK:\n${feedbackSummary}`
      : 'No feedback this week — use check-in signals and self-assessment.',

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

    `DATA USE: Scores = coaching intelligence, never cite directly.
Low body/energy/mental → soften load. Poor sleep → recovery. High pulse → protect easy days. Strong feedback → validate. Mixed → name inconsistency.`,

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
  week: WeekSession[] = [],
): string {
  // Asserted here, at the prompt builder, because that is where AGENTS.md says
  // the assertion belongs — not only in `buildWeeklyCheckIn`. Both arguments are
  // covered: the check-in (whose equipment and onboarding answers are athlete
  // free text) and the Reference, which arrives separately and carries a session
  // note. Relying on the upstream builder left this reachable by any caller that
  // assembled a CheckIn itself.
  assertNoDirectIdentifier(checkIn);
  if (sessionContext) assertNoDirectIdentifier(sessionContext);
  // The week arrives separately and carries athlete and Coach free text in its
  // notes, so it is asserted here for the same reason the Reference is: at the
  // prompt builder, not per caller.
  assertNoDirectIdentifier(week);

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
phase=${phase} xp=${experienceLevel || 'intermediate'} sessions=${sessionCount} body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm${race}${noTrain}`,

    weekBlock(week),

    equipmentBlock(buildEquipmentLines(equipment)),

    onboardingBlock(onboarding),

    CONSTRAINT_SIGNALS,

    referenceBlock(sessionContext, phase),

    commStyleBlock(commStyle),

    "PRIVACY: Never use athlete's name. Second person only. No PII reproduction.",
  ]);
}

/**
 * How each authorship reads to the Coach.
 *
 * Plain second-person phrases rather than the stored `origin` values, because
 * the model reasons about them: "you planned this" and "the athlete's Head Coach
 * set this" are the difference between a Coach that reshapes its own session and
 * one that explains and holds on someone else's (ADR 0003).
 *
 * The `garmin` origin is a **Detected Activity** in `CONTEXT.md`'s terms. The
 * label stays plain language for the same reason the others do — the model is
 * being told what happened, not taught the glossary — but the domain term is
 * named here so a reader of this code can find the entry that governs it.
 */
const ORIGIN_LABEL: Record<SessionOrigin, string> = {
  coach: 'you planned this',
  head_coach: "the athlete's Head Coach set this",
  athlete: 'the athlete added this themselves',
  garmin: "logged from the athlete's watch",
};

/**
 * The week's sessions as natural references — weekday + ISO date + type, with
 * the position qualifier only for same-type Doubles. Never an entity id
 * (CONTEXT.md, Week Activity).
 *
 * The session the athlete tapped renders short: its parameters and note belong
 * to the SESSION DISCUSSION block below, so the one session the athlete is
 * actually asking about is described once rather than twice.
 */
export function formatWeekSessions(week?: WeekSession[]): string | null {
  if (!week || week.length === 0) return null;
  return week
    .map((s) => {
      // The athlete's own label, when they gave one: a session typed `Other`
      // says nothing on its own, and "Other" is not a thing a Coach can discuss.
      const label = s.title ? ` "${s.title}"` : '';
      const head = `- ${dayReference(s.date)}: ${qualifiedType(s.sessionType, s.position)}${label}`;
      const authorship = ORIGIN_LABEL[s.origin];

      if (s.isReference) {
        return `${head} — ${s.status} (${authorship}) · this is the one they tapped, detail below`;
      }

      const params = [
        s.durationMinutes ? `${s.durationMinutes} min` : null,
        s.zone ? `Zone ${s.zone}` : null,
      ].filter(Boolean);
      const paramPart = params.length > 0 ? ` · ${params.join(' · ')}` : '';
      const notePart = s.note ? ` · "${s.note}"` : '';
      return `${head}${paramPart} — ${s.status} (${authorship})${notePart}`;
    })
    .join('\n');
}

/**
 * The athlete's current week (Mon–Sun) in the Coach Chat prompt.
 *
 * The current week and not next week: the week is the planning unit — the same
 * reasoning that retired the Cross-Week Move — and next week is the Weekly
 * Session's to present, so a Coach discussing it here would preempt that
 * conversation's Review phase.
 *
 * The authority paragraph rides with the sessions rather than sitting in the
 * static posture text, because it is only meaningful next to the labels it
 * refers to, and because a week with no Head-Coach session should not spend
 * prompt on a rule that cannot apply.
 */
function weekBlock(week: WeekSession[]): PromptBlock {
  const lines = formatWeekSessions(week);
  if (!lines) return null;

  const hasPrescribed = week.some((s) => s.origin === 'head_coach');
  const authority = hasPrescribed
    ? `\n\nAUTHORITY: The Head Coach's sessions are theirs, not yours. Explain and defend them — why they were set, why they are a good idea — as one team, one plan, one voice. Never offer to change or remove one; the Head Coach decides. For your own sessions, talk freely about alternatives.`
    : '';

  return `THIS WEEK (Mon-Sun, every session on the athlete's calendar — refer to a session by its day and type, never by a number or id):
${lines}${authority}`;
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
