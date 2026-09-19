import { detectPatterns } from './pattern-insight';
import {
  CONSTRAINT_SIGNALS,
  assemble,
  commStyleBlock,
  equipmentBlock,
  groundingBlock,
  onboardingBlock,
  openingBlock,
  buildEquipmentLines,
  type PromptBlock,
} from './prompt-blocks';
import type { PlanningWindow } from './planning-window';
import type { SkeletonDay } from './week-draft';
import type { ProposedSession } from './weekly-session';
import type { RetrievedPassage } from '@/features/knowledge-oracle/retrieval';
import type { Citation } from '@/lib/citation';
import { ADJUST_TRAINING_BLOCKS_TOOL_NAME, type BlockAdjustmentContext } from './block-adjustment';
import type { TrainingBlock } from './training-blocks';
import type { PresenceStage } from './presence';
import { assertNoDirectIdentifier } from './check-in';
import type { SessionOrigin } from '@/features/session/session';
import type { WeekSession } from './week';
import type {
  CheckIn,
  RaceMention,
  Readiness,
  SessionContext,
  SessionHistoryItem,
  SkippedSession,
  WeekActivity,
  WeekFeedbackEntry,
} from './check-in';

/**
 * The Coach's athlete-facing prompts: Coach Chat, the silent week draft and the
 * block adjustment. (The Weekly Session's prompt lived here until the behavior
 * was retired — ADR 0007, amended 2026-09-16, `training-architecture/21`.)
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

// ── The week, as the prompts read it ─────────────────────────────────────────

// One-based: a Double's position is 1, 2, 3 - never 0 - so the list starts at
// '1st' rather than carrying an empty slot nothing can reach.
const ORDINALS = ['1st', '2nd', '3rd'];
function ordinal(n: number): string {
  return ORDINALS[n - 1] || `${n}th`;
}

// Dropping `T00:00:00` below parses the key as UTC, which renders the PREVIOUS
// weekday for anyone west of Greenwich - a real bug, and invisible to a suite
// that runs east of it, as this one does. A test that forced the timezone was
// written and removed: `process.env.TZ` does not take effect inside Stryker's
// runner, so it aborted the whole mutation run. The durable fix is a fixed TZ
// for the test environment (vitest config), which is a change for its own PR.
const weekdayShort = (dateKey: string): string =>
  // Stryker disable next-line StringLiteral: see above - not equivalent, but
  // only distinguishable in a timezone this suite never runs in.
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
  // Stryker disable next-line ArrayDeclaration: equivalent. `detectPatterns`
  // returns [] for anything shorter than PATTERN_THRESHOLDS.minOccurrences (3),
  // so a one-element default is indistinguishable from an empty one.
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

/**
 * The days this plan may cover, and what to say when there are none left.
 *
 * A fall-through is the only circumstance in which a new athlete sees an empty
 * current week, and the decision that allows it (Mads, 2026-09-02) allows it
 * only on condition that the Coach says when training starts. That condition is
 * carried here, in the line itself, so the two cannot drift apart.
 */
function planningWindowLine(window: PlanningWindow): string {
  const span = `PLANNING WINDOW: ${window.start} to ${window.end}.`;
  return window.fellThrough
    ? `${span} Nothing is plannable in the rest of this week, so the plan starts next week — say when training starts, plainly, rather than leaving an empty week unexplained.`
    : `${span} Plan these days only; a later week is not yours to write.`;
}

/**
 * The readiness scores as prompt tokens, or '' when the athlete never gave any.
 *
 * The three the athlete reports are always present; the three that need a device
 * or a rated session are appended only when they exist. An absent token is
 * absence the model can act on — a defaulted one is a number nobody gave, which
 * is the defect `code-health/07` removed.
 */
function readinessTokens(readiness?: Readiness): string {
  if (!readiness) return '';
  const { body, energy, sleepQuality, mental, sleepHours, restingPulse } = readiness;
  return [
    `body=${body}/10`,
    `energy=${energy}/10`,
    `sleep-quality=${sleepQuality}/10`,
    mental === undefined ? null : `mental=${mental}/10`,
    sleepHours === undefined ? null : `sleep=${sleepHours}h`,
    restingPulse === undefined ? null : `pulse=${restingPulse}bpm`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The same, space-prefixed for the templates that append it mid-line. */
function readinessFragment(readiness?: Readiness): string {
  const tokens = readinessTokens(readiness);
  return tokens ? ` ${tokens}` : '';
}

/**
 * `name=value`, or nothing at all when there is no value.
 *
 * The whole point of this file is that the Coach is not told things that are not
 * true, and `sessions=undefined` is a thing that is not true — it is a template
 * hole rendered as a word, and the model has no way to read it as absence. An
 * omitted token is absence the model can actually act on, and it is what every
 * other optional part of these prompts already does.
 */
function tag(name: string, value: string | number | undefined): string | null {
  return value === undefined || value === '' ? null : `${name}=${value}`;
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
/**
 * What the Coach cannot see, said plainly.
 *
 * Two versions, because after `training-architecture/05` there are two different
 * gaps and telling them apart matters. With **no Check-in** the Coach has
 * nothing the athlete reported this week. With one, it has their own report and
 * still has **no device data** — sleep duration and resting heart rate are
 * expected from Garmin or similar and there is no feed yet (Mads, 2026-09-09).
 *
 * Deleting the second when the Check-in shipped was the tempting move and would
 * have been a false claim by omission: the Coach would stop being told it cannot
 * see a resting pulse while it still cannot. That is the same defect
 * `code-health/07` fixed, pointing the other way.
 */
const NO_CHECK_IN = `NO CHECK-IN DATA: The athlete has not checked in this week — you have no energy, physical-condition or sleep-quality figures from them, and no sleep duration or resting pulse. Do not infer any of it, and never imply you can see how they slept or recovered. Ask, and coach from what they tell you in words.`;

const NO_DEVICE_DATA = `NO DEVICE DATA: The athlete's own check-in is above. You have no measured sleep duration and no resting heart rate — nothing wearable feeds this app yet. Reason from what they reported and from their session ratings; never imply you can see how long they actually slept.`;

/**
 * Which absence to declare, judged on the fields themselves.
 *
 * It used to key on whether a `Readiness` existed at all, which was right only
 * for as long as no device fed anything: the day a Garmin feed lands, that
 * version would render `sleep=7h pulse=50bpm` and then assert, one block later,
 * that the Coach has no measured sleep duration or resting heart rate. A false
 * claim beside the true numbers contradicting it — which is the exact defect
 * splitting these two messages was meant to prevent, so it is now judged on the
 * device fields rather than on their container.
 *
 * Saying nothing is not an option here. Silence about what the Coach cannot see
 * is what `code-health/07` removed.
 */
function noDataBlock(readiness?: Readiness): string {
  if (!readiness) return NO_CHECK_IN;
  const hasDeviceData =
    readiness.sleepHours !== undefined || readiness.restingPulse !== undefined;
  return hasDeviceData ? '' : NO_DEVICE_DATA;
}

/**
 * The horizon: what shape of race the athlete trains for, and when the race is.
 *
 * Always rendered, in all four combinations, because **omission is the failure
 * mode**. A prompt with no race line reads to the model as one whose race line
 * was forgotten, and it will invent a horizon to plan toward — the same class of
 * defect `NO_CHECK_IN` exists to prevent one block down.
 *
 * Race Distance is stated even when no race is booked: an athlete building
 * toward an Ironman with nothing in the calendar still needs an Ironman-shaped
 * week (*Distancens Arkitektur* §14). And an athlete who was never asked is
 * reported as unknown rather than defaulted — the migration backfills nothing,
 * because a distance is not derivable from a race name.
 */
function horizonBlock(
  raceDistance: string | null | undefined,
  raceTarget: string | null | undefined,
  raceDate: string | null | undefined,
  phase: string | null | undefined,
  blockWeek: string | null | undefined,
  races: RaceLinesInput,
): string {
  const distance = raceDistance ? `distance=${raceDistance}` : 'distance unknown — ask';
  const race =
    raceTarget && raceDate
      ? `race=${raceTarget} on ${raceDate}`
      // Not "the athlete said so": no race can mean they declared they have
      // none *or* that every race they had has passed, and the prompt cannot
      // tell which. Asserting the decision would be a claim about the athlete
      // that nobody made — the fabrication `NO_CHECK_IN` exists to prevent, one
      // block down.
      : 'no race booked — do not assume one';
  // The block and the position inside it, when there is a horizon to be inside.
  // Omitted together, because half of it says less than nothing.
  const block = phase && blockWeek ? ` · ${phase}, ${blockWeek}` : '';
  return [`HORIZON: ${distance} · ${race}${block}`, ...raceLines(races)].join('\n');
}

/** The slice-09 half of the horizon, as the Check-in carries it. */
type RaceLinesInput = Pick<CheckIn, 'tuneUps' | 'lateRaces' | 'tuneUpWindow' | 'tuneUpEveEasy'>;

const mention = (r: RaceMention) => `${r.name} on ${r.date} (${r.distance})`;

/**
 * The lines beneath HORIZON for the athlete's other races
 * (`training-architecture/09`). Each is omitted when it has nothing to say —
 * the same rule as the block line, because "TUNE-UPS: none" reads to the model
 * as a deficiency and the glossary says a plan without one is not deficient.
 *
 * The window line is rendered whenever the Check-in carries a window, and the
 * *service* only carries one while today is inside it (`inTuneUpWindow`). That
 * split is what keeps this a pure renderer and the nag-prevention testable at
 * the seam that decides it.
 */
function raceLines(races: RaceLinesInput): string[] {
  return [
    tuneUpsLine(races.tuneUps, races.tuneUpEveEasy),
    lateRacesLine(races.lateRaces),
    tuneUpWindowLine(races.tuneUpWindow),
  ].filter((line): line is string => line !== null);
}

function tuneUpsLine(tuneUps: RaceMention[] | undefined, eveEasy: boolean | undefined): PromptBlock {
  if (!tuneUps || tuneUps.length === 0) return null;
  const eve = eveEasy ? ' — keep the day before easy' : '';
  return `TUNE-UPS: ${tuneUps.map(mention).join('; ')} — ordinary training day, do not taper${eve}`;
}

function lateRacesLine(lateRaces: RaceMention[] | undefined): PromptBlock {
  if (!lateRaces || lateRaces.length === 0) return null;
  return `LATE RACE: ${lateRaces.map(mention).join('; ')} — entered after this week was planned; the blocks were not built toward it. Say so; adjust the week only`;
}

function tuneUpWindowLine(window: { from: string; to: string } | null | undefined): PromptBlock {
  if (!window) return null;
  return `TUNE-UP WINDOW: now (${window.from}–${window.to}) — you may suggest a tune-up race in this span, once and lightly; never imply the plan is deficient without one`;
}

/** The STATE line — coaching intelligence, never quoted back to the athlete. */
function stateBlock(s: {
  phase?: string;
  presenceStage?: PresenceStage;
  experienceLevel?: string;
  readiness?: Readiness;
}): string {
  const parts = [
    tag('phase', s.phase),
    tag('presence', s.presenceStage),
    readinessTokens(s.readiness) || null,
    `xp=${s.experienceLevel || 'intermediate'}`,
  ].filter((part): part is string => part !== null);

  return `STATE: ${parts.join(' ')}`;
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

// ── The Presence Arc ──────────────────────────────────────────────────────────

/**
 * The Presence Arc, as the Coach's instructions for how much it may claim to
 * know (CONTEXT.md, re-keyed 2026-09-16). The stage is decided from stored data
 * — weeks of Session Reflections and Check-ins filed (`presence.ts`) — so the
 * arc is earned, not simulated: each stage tells the Coach exactly how much
 * history it has. Provisional by Mads's ruling; the honest floor, not the design.
 */
const PRESENCE_COLD_START = `PRESENCE — COLD START:
You know this athlete only from onboarding and what they tell you now: no reflections, no check-ins, no history. Don't fake familiarity or recall a week you haven't seen. Ask one grounding question before you assume — where they are physically right now — and explain your reasoning more than usual; this is their first exposure to how you coach.`;

const PRESENCE_BUILDING = `PRESENCE — BUILDING:
You have a week or two of their reflections and check-ins. Reference something specific you actually have; say plainly the picture is still forming. Declare uncertainty where evidence is thin — two consistent weeks is "starting to notice a pattern", never more.`;

const PRESENCE_FULL = `PRESENCE — FULL:
Several weeks of reflections and check-ins. Synthesise their self-assessment, session feedback and signals; name patterns, strong sessions and warnings, and flag gaps between how they read themselves and what the data says.`;

/** The stage's instructions, or nothing when a caller supplied no stage. */
function presenceBlock(stage: PresenceStage | undefined): PromptBlock {
  switch (stage) {
    case 'cold_start':
      return PRESENCE_COLD_START;
    case 'building':
      return PRESENCE_BUILDING;
    case 'full':
      return PRESENCE_FULL;
    default:
      return null;
  }
}

const FIRST_CONVERSATION_ORIENTATION = `FIRST CONVERSATION ORIENTATION:
Before closing, weave 2-3 sentences — coach orienting athlete, not product tour:
1. Training Plan tab — tap sessions to log body/mind; that's how I learn what works for you
2. Equipment tab — add gear for more specific advice
3. Glossary — unfamiliar terms, it's there
Once only — never repeat it in a later turn.`;

const EQUIPMENT_NUDGE = `EQUIPMENT NUDGE: One sentence when it fits — don't know what they train on; Equipment tab helps you be specific. Once only.`;

/**
 * The Guided Tour's beat for this conversation, or nothing.
 *
 * Both beats are the Coach's voice rather than a UI overlay (ADR 0001), and
 * they moved with the arc when it was re-keyed: orientation while the Coach is
 * at cold start (the first conversation ever, in practice), and the Equipment
 * nudge while the picture is building — but only while the tab is still empty,
 * because a nudge to fill in something already filled in reads as a Coach that
 * has not looked.
 */
function guidedTourBlock(stage: PresenceStage | undefined, hasEquipment: boolean): PromptBlock {
  if (stage === 'cold_start') return FIRST_CONVERSATION_ORIENTATION;
  if (stage === 'building' && !hasEquipment) return EQUIPMENT_NUDGE;
  return null;
}

/**
 * The days the athlete said were off, or nothing.
 *
 * "don't mention unless athlete raises it" is the point of the wording: an
 * Unavailable Date is a fact to plan around, not something to be asked about.
 */
function unavailableBlock(unavailableDates?: string[]): PromptBlock {
  if (!unavailableDates || unavailableDates.length === 0) return null;
  return `UNAVAILABLE: ${unavailableDates.join(', ')} — no sessions, don't mention unless athlete raises it.`;
}

// ── Coach Chat prompt ─────────────────────────────────────────────────────────

/**
 * Every athlete-authored string on the Coach Chat path, checked in one place.
 *
 * Three inputs rather than one, and each is a separate way in: the check-in
 * (equipment names and onboarding answers), the Reference (a session note), and
 * the week (athlete and Coach notes). Asserting at the prompt builder rather
 * than per caller is what AGENTS.md asks for - a caller that assembled a CheckIn
 * itself used to walk straight past the one in `buildWeeklyCheckIn`.
 */
function assertChatInputsCarryNoIdentifier(
  checkIn: CheckIn,
  sessionContext: SessionContext | null,
  week: WeekSession[],
): void {
  assertNoDirectIdentifier(checkIn);
  // No truthiness guard on the Reference: `assertNoDirectIdentifier` already
  // no-ops on null, so a guard here was a second way of saying the same thing.
  // Removed rather than suppressed, on that function's own advice - an
  // equivalent mutant is usually telling you about the code.
  assertNoDirectIdentifier(sessionContext);
  assertNoDirectIdentifier(week);
}

/** The athlete's no-training days as a CONTEXT fragment, or nothing. */
function noTrainFragment(fixedConstraints?: string[]): string {
  if (!fixedConstraints || fixedConstraints.length === 0) return '';
  return ` no-train=${fixedConstraints.join(', ')}`;
}

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
/** What Coach Chat may write and what is already on the table (`training-architecture/20`). */
export interface ChatPlanning {
  /** The server-chosen window a proposal must fall inside. */
  window: PlanningWindow;
  /** The drafted week the athlete brought in to discuss, or null. */
  stagedProposal: ProposedSession[] | null;
}

export function buildChatPrompt(
  checkIn: CheckIn,
  today: string = todayISO(),
  sessionContext: SessionContext | null = null,
  week: WeekSession[] = [],
  planning: ChatPlanning | null = null,
): string {
  // Asserted here, at the prompt builder, because that is where AGENTS.md says
  // the assertion belongs — not only in `buildWeeklyCheckIn`. Both arguments are
  // covered: the check-in (whose equipment and onboarding answers are athlete
  // free text) and the Reference, which arrives separately and carries a session
  // note. Relying on the upstream builder left this reachable by any caller that
  // assembled a CheckIn itself.
  assertChatInputsCarryNoIdentifier(checkIn, sessionContext, week);

  const {
    readiness,
    phase,
    commStyle,
    experienceLevel,
    presenceStage,
    language,
    fixedConstraints,
    equipment,
    raceTarget,
    raceDistance,
    raceDate,
    blockWeek,
    tuneUps,
    lateRaces,
    tuneUpWindow,
    tuneUpEveEasy,
    capacity,
    notableSignal,
    onboarding,
  } = checkIn;
  const races = { tuneUps, lateRaces, tuneUpWindow, tuneUpEveEasy };

  const noTrain = noTrainFragment(fixedConstraints);
  const equipmentLines = buildEquipmentLines(equipment);

  return assemble([
    openingBlock(
      language,
      'Coach Chat — on-demand open conversation. Training, nutrition, equipment, race logistics, mindset, injury, anything.',
    ),

    `POSTURE: Confident, evidence-led, direct. Real conversation — respond to what they're asking. One follow-up if needed. Concise. ${HOLD_POSITION} No markdown, no lists unless athlete asks for breakdown.`,

    groundingBlock(),

    // How much the Coach may claim to know, decided from what it has
    // (`training-architecture/21`); the Weekly Session used to carry this arc.
    presenceBlock(presenceStage),

    `TODAY: ${today}`,

    `CONTEXT (use silently — never cite scores/numbers):
${[
  tag('phase', phase),
  `xp=${experienceLevel || 'intermediate'}`,
]
  .filter((part): part is string => part !== null)
  .join(' ')}${readinessFragment(readiness)}${noTrain}`,

    // The same horizon the Weekly Session plans against. Chat used to carry
    // `race=name` and nothing else of it, so "should I do tomorrow's intervals?"
    // was answered by a Coach that did not know when the race was.
    horizonBlock(raceDistance, raceTarget, raceDate, phase, blockWeek, races),

    // What the athlete's body currently allows, or nothing at all when nothing
    // is restricted (ADR 0011) — the same sentence the Weekly Session carries.
    // Chat is where "should I do tomorrow's intervals?" gets asked, and until
    // training-architecture/06 it was answered by a Coach that did not know the
    // athlete could not run.
    capacity ?? null,

    // The athlete's own words from this week's Check-in, quoted and labelled as
    // theirs — the service reads the Check-in for exactly this, and until PR #60
    // the sentence reached this function and went no further.
    notableSignal ? `ATHLETE SAID (their words, this week): "${notableSignal}"` : null,

    noDataBlock(readiness),

    weekBlock(week),

    equipmentBlock(equipmentLines),

    onboardingBlock(onboarding),

    // The one conversation may agree a week (`training-architecture/20`): the
    // bound the server will enforce, the week already on the table if one was
    // brought in, and the two lines the Weekly Session has always carried.
    ...chatPlanningBlocks(planning),

    CONSTRAINT_SIGNALS,

    referenceBlock(sessionContext, phase),

    commStyleBlock(commStyle),

    "PRIVACY: Never use athlete's name. Second person only. No PII reproduction.",

    guidedTourBlock(presenceStage, equipmentLines.length > 0),
  ]);
}

/**
 * The planning half of the chat prompt, in the order the Weekly Session renders
 * the same lines; nothing at all when the chat was given no window.
 *
 * The staged week is the Coach's own by the time it arrives (approval strips
 * the Head Coach's notes), but this is the boundary and it asserts on every
 * input regardless of what the caller promised — as the weekly prompt does.
 */
function chatPlanningBlocks(planning: ChatPlanning | null): PromptBlock[] {
  if (!planning) return [];
  assertNoDirectIdentifier(planning.stagedProposal);
  return [
    planningWindowLine(planning.window),
    stagedProposalBlock(planning.stagedProposal ?? undefined),
    DOUBLES,
    SAVING_THE_PLAN,
  ];
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
  return week.map(weekSessionLine).join('\n');
}

/** One session as the Coach reads it: day, type, parameters, status, author. */
function weekSessionLine(s: WeekSession): string {
  // The athlete's own label, when they gave one: a session typed `Other`
  // says nothing on its own, and "Other" is not a thing a Coach can discuss.
  const label = s.title ? ` "${s.title}"` : '';
  const head = `- ${dayReference(s.date)}: ${qualifiedType(s.sessionType, s.position)}${label}`;
  const authorship = ORIGIN_LABEL[s.origin];

  if (s.isReference) {
    return `${head} — ${s.status} (${authorship}) · this is the one they tapped, detail below`;
  }

  return `${head}${sessionParams(s)} — ${s.status} (${authorship})${sessionNote(s)}`;
}

/** Duration and zone as a separated tail, or nothing when the session has neither. */
function sessionParams(s: WeekSession): string {
  const params = [
    s.durationMinutes ? `${s.durationMinutes} min` : null,
    s.zone ? `Zone ${s.zone}` : null,
  ].filter(Boolean);
  return params.length > 0 ? ` · ${params.join(' · ')}` : '';
}

/**
 * The session's note, unless a Head Coach wrote it.
 *
 * **A Head Coach's note is never sent** (Mads, 2026-08-21). The other origins are
 * fine here: a `coach` note is the Coach's own words coming back, and an
 * `athlete` or `garmin` note is the athlete's own free text, which the consent
 * disclosure covers. A Head Coach's note is neither — it is a third party's prose
 * *about* the athlete, written by someone who never agreed to have it processed,
 * and "I want you sharp for Lars's ride" puts a name in front of the model that
 * `assertNoDirectIdentifier` cannot see (it recognises email and phone shapes,
 * never a name in prose). Structural, not filtered: not sent.
 */
function sessionNote(s: WeekSession): string {
  return s.note && s.origin !== 'head_coach' ? ` · "${s.note}"` : '';
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

  return `THIS WEEK (Mon-Sun, every session on the athlete's calendar this week — refer to a session by its day and type, never by a number or id):
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

// ── The Training Block adjustment (stage 2) ───────────────────────────────────

function draftLine(b: TrainingBlock): string {
  const days =
    (new Date(`${b.endDate}T00:00:00Z`).getTime() - new Date(`${b.startDate}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000) +
    1;
  return `- ${b.name}: ${b.startDate} to ${b.endDate} (${Math.round(days / 7)} weeks)`;
}

/** This week's Check-in as one line, or the plain statement that there is none. */
function checkInLine(ctx: BlockAdjustmentContext): string {
  if (!ctx.readiness) return 'This week: No Check-in this week.';
  const signal = ctx.notableSignal ? ` · "${ctx.notableSignal}"` : '';
  return `This week's Check-in: ${readinessTokens(ctx.readiness)}${signal}`;
}

function athleteBlock(ctx: BlockAdjustmentContext): string {
  const lines = [
    tag('Experience', ctx.experienceLevel)?.replace('=', ': ') ?? 'Experience: not stated',
    ctx.capacity,
    checkInLine(ctx),
  ].filter((l): l is string => l !== null);
  const reflections =
    formatWeekFeedback(ctx.reflections) ?? '- No Session Reflections rated in the last four weeks.';
  return `ATHLETE:\n${lines.map((l) => `- ${l}`).join('\n')}\n\nSESSION REFLECTIONS (last four weeks, Body/Mind the athlete reported):\n${reflections}`;
}

/**
 * The briefing the Coach shapes the Training Blocks from (`training-architecture/07`).
 *
 * Runs once per Target Race, in the background, with no athlete in the
 * conversation — so unlike every other prompt here it addresses the model about
 * a tool call, not about a person to talk to. Facts only: the draft, the
 * horizon, what the app knows about the athlete. The rules are the shape the
 * reply must have and one instruction about weight — the "unrealistic" sentence
 * is the heaviest thing the Coach can say, and the prompt says so in those words.
 */
export function renderBlockAdjustmentPrompt(ctx: BlockAdjustmentContext): string {
  const distance = ctx.race.distance ? `distance=${ctx.race.distance}` : 'distance unknown';
  return assemble([
    `You are Coach in a luxury Ironman training app. You are shaping the Training Blocks of one athlete's horizon toward their Target Race. This runs once, in the background: the athlete is not in this conversation and will read the result later in your own voice, so do not address them here — call the tool.`,
    `HORIZON: ${distance} · race=${ctx.race.name} on ${ctx.race.date} · ${ctx.weeksToRace} weeks from today (${ctx.today})`,
    `ARITHMETIC DRAFT (the horizon divided evenly, with no purpose yet):\n${ctx.draft.map(draftLine).join('\n')}`,
    athleteBlock(ctx),
    `RULES:
- Keep two to six blocks, contiguous from today. The last block must end on race day, ${ctx.race.date}; never move race day.
- Name each block for what it achieves, in at most four words. Never a position such as "Block 2" or "Phase 3".
- Move a boundary only with a reason you could say to the athlete; otherwise keep the draft's dates. Every block is at least seven days.
- Saying the race is unrealistic is the heaviest sentence you can produce. Use it only when the horizon makes the distance genuinely unreachable, and expect to use it almost never.
- Call ${ADJUST_TRAINING_BLOCKS_TOOL_NAME} exactly once, with the whole set. Write no prose to the athlete.`,
  ]);
}

// ── The silent week draft (training-architecture/16) ─────────────────────────

/**
 * Everything the Weekly Session prompt reasons from, plus the week being
 * drafted: its window, the computed skeleton the Coach adjusts, and the
 * training science retrieved for it. Assembled by the draft service; rendered
 * by {@link renderWeekDraftPrompt}.
 */
export interface WeekDraftContext extends WeeklyContext {
  window: PlanningWindow;
  skeleton: SkeletonDay[];
  passages: RetrievedPassage[];
  citations: Citation[];
}

/**
 * The two lines every conversation that may propose a week carries — the
 * Weekly Session's since its first proposal, Coach Chat's since
 * `training-architecture/20`. One text, so the Coach is told the same rule
 * whichever surface it is on.
 */
const DOUBLES =
  "DOUBLES: In planning you may propose two sessions on one day (e.g. a main session plus a short recovery block) when the athlete's phase and load genuinely call for it. Never forced — most days hold one session.";

/**
 * The card is the only question (Mads, 2026-09-17, grill on the PR #71 smoke
 * run). It used to say "call it only after agreement", and the Coach obeyed:
 * it laid out a revised week in prose, asked "shall we go with this?", and the
 * card still held the original draft — the athlete said yes, tapped Save, and
 * got the old week. Two places to say yes. Now the tool call *is* the question.
 */
const SAVING_THE_PLAN =
  'SAVING THE PLAN: Whenever you lay out a full week, call the propose_week_plan tool with it — every session dated (YYYY-MM-DD), rest days omitted. The card that shows the athlete is the question; they confirm or cancel there. Never describe a week in prose and ask whether to go with it. This does NOT save. Keep discussing single changes in words; propose the week again, through the tool, when it changes. Every date must fall inside the PLANNING WINDOW above; dates outside it are dropped by the server.';

/**
 * The Coach holds a position it can ground (CONTEXT.md, Hyper Intelligence;
 * ADR 0007 amended 2026-09-17). The line had lived in the Weekly Session's
 * prompt only; Coach Chat dropped its week at the first push.
 */
const HOLD_POSITION =
  'Hold position unless the athlete gives a reason you can act on — time, pain, fatigue, a constraint — or cannot follow your reasoning; never because they asked twice. When you hold, say why in one sentence, from the evidence you have. The athlete keeps the last word in the calendar, so holding costs them nothing.';

/**
 * The week the athlete brought into the conversation from their calendar
 * (`/18`): it is already on the table as the pending proposal, so the Coach
 * discusses *that* week rather than proposing a fresh one.
 */
function stagedProposalBlock(sessions?: ProposedSession[]): PromptBlock {
  if (!sessions || sessions.length === 0) return null;
  return `PROPOSED WEEK (drafted for the athlete, already shown to them as a proposal — they opened this conversation to discuss it):
${sessions.map(stagedSessionLine).join('\n')}
Talk about this week. If they want changes, agree them and call propose_week_plan with the revised week; if they are happy, tell them to confirm the proposal they already have.`;
}

/** One staged session as the Coach reads it: date and type always, the rest only when set. */
export function stagedSessionLine(s: ProposedSession): string {
  const parts = [`${s.date}: ${s.type}`];
  if (s.durationMinutes) parts.push(`${s.durationMinutes}min`);
  if (s.zone) parts.push(s.zone);
  const line = parts.join(' ');
  return s.note ? `${line} — ${s.note}` : line;
}

/** Today and the week being drafted, with the days ruled out of it. */
function draftWindowBlock(today: string, window: PlanningWindow, fixedConstraints?: string[]): string {
  const lines = [`TODAY: ${today}`, `WEEK WINDOW: ${window.start} to ${window.end}`];
  if (window.excludedDates.length > 0) lines.push(`NO TRAINING ON: ${window.excludedDates.join(', ')}`);
  if (fixedConstraints && fixedConstraints.length > 0) {
    lines.push(`RECURRING NO-TRAIN DAYS: ${fixedConstraints.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * The skeleton as one dated line per day, with the instruction that makes it a
 * default rather than a diktat (Mads, 2026-09-09: the structure is the
 * default, the Coach makes the adjustments).
 */
function skeletonBlock(skeleton: SkeletonDay[]): string {
  const lines = skeleton.map((d) => `${d.date}: ${d.role}`);
  return `WEEK SKELETON (the default — one role per day):
${lines.join('\n')}
Adjust this skeleton for the athlete. Keep the rest day and the long/hard spacing unless you have a stated reason to move them.`;
}

/**
 * The retrieved passages, numbered, each with the source it came from — or the
 * one line that says nothing came back and forbids inventing it. The Knowledge
 * Oracle's SAFE-3 bar: a training-science claim comes with a source or is not
 * made.
 */
function trainingScienceBlock(passages: RetrievedPassage[], citations: Citation[]): string {
  if (passages.length === 0) {
    return 'TRAINING SCIENCE: No sources were retrieved for this week. Do not assert a training-science claim; plan from the skeleton and what the athlete has reported.';
  }
  const byId = new Map(citations.map((c) => [c.sourceId, c.attribution]));
  const lines = passages.map((p, i) => `[${i + 1}] ${p.text} — ${byId.get(p.sourceId) ?? 'source unknown'}`);
  return `TRAINING SCIENCE (retrieved for this week; cite by number where a choice rests on it):
${lines.join('\n')}`;
}

/**
 * The system prompt for drafting a week with nobody in the room.
 *
 * The Weekly Session's blocks where they still apply — horizon, capacity, the
 * athlete's own words, state, last week's reflections, unavailable days — and
 * none of its conversation: no arc, no check-in questions, no guided tour.
 * There is no athlete to ask, so the prompt says what it knows and what it
 * does not, and asks for exactly one tool call covering the whole window.
 */
export function renderWeekDraftPrompt(ctx: WeekDraftContext): string {
  assertNoDirectIdentifier(ctx.checkIn);

  const { feedbackSummary, unavailableDates, today, window, skeleton, passages, citations } = ctx;
  const {
    readiness,
    phase,
    experienceLevel,
    presenceStage,
    language,
    fixedConstraints,
    raceTarget,
    raceDistance,
    raceDate,
    blockWeek,
    capacity,
    notableSignal,
    tuneUps,
    lateRaces,
    tuneUpWindow,
    tuneUpEveEasy,
  } = ctx.checkIn;
  const races = { tuneUps, lateRaces, tuneUpWindow, tuneUpEveEasy };

  return assemble([
    openingBlock(language, 'Drafting next week on your own — the athlete is not in the conversation.'),

    'POSTURE: Confident, evidence-led, direct. You are drafting a proposal the athlete will accept, discuss or decline later; nothing you propose is saved.',

    horizonBlock(raceDistance, raceTarget, raceDate, phase, blockWeek, races),

    capacity ?? null,

    notableSignal ? `ATHLETE SAID (their words, this week): "${notableSignal}"` : null,

    draftWindowBlock(today, window, fixedConstraints),

    stateBlock({ phase, presenceStage, experienceLevel, readiness }),

    lastWeekFeedbackBlock(feedbackSummary, readiness),

    unavailableBlock(unavailableDates),

    skeletonBlock(skeleton),

    trainingScienceBlock(passages, citations),

    'PROPOSING: Call the propose_week_plan tool once, for the whole window — every session dated (YYYY-MM-DD) inside it, omit rest days. Do not write prose first; the tool call is the answer. The server refuses dates outside the window.',

    dataUseBlock(readiness),
  ]);
}
