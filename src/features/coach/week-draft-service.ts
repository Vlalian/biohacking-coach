import { logCoachFailure } from '@/lib/coach-log';
import { addDays, weekStartOf } from '@/lib/date';
import { getAthleteById } from '@/features/athlete/athlete-repository';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getArithmeticSessionsForWeek, getSessionsForWeek, getSessionsInRange } from '@/features/session/session-repository';
import { capacityFor } from '@/features/health/health-repository';
import { assertAiCoachingConsent } from '@/features/consent/consent-gate';
import { openAiEmbedder } from '@/features/knowledge-oracle/embedder';
import { knowledgeSearch } from '@/features/knowledge-oracle/knowledge-repository';
import { retrievePassages, type RetrievalResult } from '@/features/knowledge-oracle/retrieval';
import type { PlanningWindow } from './planning-window';
import { callCoach, type CoachReply, isCoachDisabled } from './coach-client';
import { buildWeeklyContext, renderWeekDraftPrompt } from './prompts';
import { getCheckInForWeek } from './check-in-repository';
import { getPresenceStage } from './presence-repository';
import { readinessFrom, notableSignalFrom } from './check-in';
import { getResolvedBlocks } from './training-block-service';
import { getRaces } from '@/features/race/race-repository';
import { chosenFirstDay } from '@/features/onboarding/onboarding-flow';
import { blockPosition, currentBlock, type TrainingBlock } from './training-blocks';
import type { Athlete } from '@/features/athlete/athlete';
import {
  buildWeeklyCheckIn,
  PROPOSE_WEEK_PLAN_TOOL,
  PROPOSE_WEEK_PLAN_TOOL_NAME,
  validateProposedPlan,
  weekFeedbackFrom,
  whatChangedFrom,
  fourWeekSummary,
  RECENT_WEEKS,
  type ProposedSession,
} from './weekly-session';
import {
  dueWeekFor,
  hasCoachPlannedSession,
  weekSkeleton,
  weekWindow,
  HEAD_COACH_LEAD_DAYS,
  WEEK_DRAFT_OPENER,
  type DeclinedDraft,
  type SkeletonDay,
} from './week-draft';
import { getCoachByUserId, getLinkForAthlete, getRoster } from './coach-repository';
import {
  getCalendarProposalState,
  getLastDeclinedDraft,
  getWeekDraftHistory,
  recordWeekDraft,
  type CalendarProposalState,
  type ResolvedWeekDraftHistory,
} from './week-draft-repository';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';
import { getLanguageForAthlete } from '@/features/user-prefs/user-prefs-repository';

/**
 * The Coach drafts next week on its own (`training-architecture/16`) — the
 * missing half of ADR 0007's "offered, never forced": the offer is safe to
 * decline only because a draft already stands.
 *
 * {@link ensureWeekDrafted} is the single swappable entry point. The trigger
 * (`after()` on the app shell) is a thin shell around it, as the 2026-08-12
 * generation decision asked, so a move to cron later is a trigger change and
 * not a service rewrite. It never throws: every failure past the gate is
 * logged and named in the outcome, and the athlete is left exactly where they
 * were — with the offer to plan by talking.
 *
 * **Nothing here writes the calendar.** A drafted week is a proposal in the
 * `events` log (Mads, 2026-09-14); the athlete's accept (`/18`) is the only
 * write, and this module does not import the means to make one.
 */

const DRAFT_MAX_TOKENS = 1400;
const DRAFT_ACK = 'Staged as a proposal for the athlete. Reply with one word.';

/** Why a run ended where it did. Returned for the log and the tests; the trigger ignores it. */
export type DraftOutcome =
  | 'consent-refused'
  | 'already-drafted'
  | 'no-window'
  | 'coach-failed'
  | 'coach-disabled'
  | 'malformed'
  | 'lost-race'
  | 'drafted';

/**
 * The cheap gate, as a pure decision over the facts the service gathered.
 *
 * Its own function so the early exits are lines here rather than guards in
 * the entry point — the shape that put the discarded `04a` build over the
 * complexity ceiling.
 *
 * **A week is drafted once** (`training-architecture/24`, Mads 2026-09-17).
 * The gate used to ask "is a draft still pending?", and pending ended at every
 * decision — Accept, Decline, Discuss — so every decision reopened the gate
 * and the next app-open drafted the same week again. Now any history but
 * `never` is `already-drafted`; a second draft is only ever the athlete's own
 * ask ({@link redraftWeek}).
 */
export function draftGate(facts: {
  consented: boolean;
  history: ResolvedWeekDraftHistory;
  window: PlanningWindow | null;
}): Exclude<DraftOutcome, 'coach-failed' | 'malformed' | 'lost-race' | 'drafted'> | null {
  if (!facts.consented) return 'consent-refused';
  if (facts.history.kind !== 'never') return 'already-drafted';
  if (!facts.window) return 'no-window';
  return null;
}

/**
 * Makes sure this athlete's due week has a drafted proposal, drafting one if
 * it does not. Idempotent and cheap on the common path: a handful of reads,
 * then nothing. Never throws.
 */
export async function ensureWeekDrafted(athleteId: string, today: string): Promise<DraftOutcome> {
  // The gate's reads sit inside the boundary too: "never throws" has to hold
  // for a dead driver on the first read, or a roster loop stops at the first
  // athlete and the shell's after() has an error nobody asked for.
  const facts = await guarded(athleteId, () => gateFacts(athleteId, today));
  if (facts === 'coach-failed') return facts;
  if ('gated' in facts) return facts.gated;
  const { dueWeek, visibleFrom, window, unavailableDates } = facts;

  const asked = await askCoach(athleteId, today, window, unavailableDates);
  if (typeof asked === 'string') return asked;

  // The last write is inside the boundary too — the promise is "never
  // throws", not "never throws until the insert" (CodeRabbit, PR #69).
  const outcome = await guarded(athleteId, () =>
    recordWeekDraft({
      athleteId,
      weekStart: dueWeek,
      visibleFrom,
      sessions: asked.sessions,
      citations: asked.citations,
      skeleton: asked.skeleton,
      adjusted: asked.adjusted,
      whatChanged: asked.whatChanged,
    }),
  );
  if (outcome === 'coach-failed') return outcome;
  return outcome === 'drafted' ? 'drafted' : 'lost-race';
}

/** A draft the gate would write now, and nothing recorded yet: what the waiting surfaces show. */
export type DraftInFlight = { weekStart: string; visibleFrom: string; expectedSeconds: number };

/**
 * Whether a draft is in flight for this athlete — derived, never stored
 * (`training-architecture/29`, triage 2026-09-17): the gate would draft the
 * due week and nothing is recorded for it, which is exactly the state the
 * shell's `after()` is drafting into while the page has already rendered. The
 * same facts as {@link ensureWeekDrafted}'s gate and no Coach call. Never
 * throws; a dead driver reads as nothing in flight, logged like the draft's
 * own failures.
 */
export async function draftInFlight(athleteId: string, today: string): Promise<DraftInFlight | null> {
  const facts = await guarded(athleteId, () => gateFacts(athleteId, today));
  if (facts === 'coach-failed' || 'gated' in facts) return null;
  return { weekStart: facts.dueWeek, visibleFrom: facts.visibleFrom, expectedSeconds: COACH_EXPECTED_SECONDS };
}

/**
 * The waiting card's read (`/29`): whether any draft is now recorded for the
 * week. A read and nothing else — the card polls this, not the page, because
 * a page refresh re-renders the shell whose `after()` would start the very
 * draft being waited on again (review of the 24+29 batch). A dead driver is
 * "not yet", logged.
 */
export async function draftLanded(athleteId: string, weekStart: string): Promise<boolean> {
  const history = await guarded(athleteId, () => getWeekDraftHistory(athleteId, weekStart));
  return history !== 'coach-failed' && history.kind !== 'never';
}

/** What the calendar's card slot shows: a proposal state, or that the draft is on its way. */
export type CalendarSlotState = CalendarProposalState | { kind: 'drafting'; weekStart: string };

/**
 * The calendar's card slot, with the in-flight draft added to the repository's
 * proposal states (`/29`). The proposal read comes first — a card, a pointer or
 * an offer is never hidden behind "drafting" — and the gate is asked only when
 * there is none.
 */
export async function calendarSlotState(athleteId: string, today: string): Promise<CalendarSlotState | null> {
  const proposal = await getCalendarProposalState(athleteId, today);
  if (proposal) return proposal;
  const inFlight = await draftInFlight(athleteId, today);
  // Nothing in flight after nothing to show: the draft may have landed between
  // the two reads (the shell's after() runs beside this render), so read once
  // more rather than show an empty slot with no poll (CodeRabbit, PR #78).
  if (!inFlight) return getCalendarProposalState(athleteId, today);
  return slotStateFor(null, inFlight, today);
}

/**
 * Pure: the proposal state wins; else an in-flight draft the athlete may see
 * today is `drafting`. A Head Coach's lead-day draft (`/17`) is stamped
 * visible from the athlete's own day, and until then it is not theirs to wait
 * for — the slot shows nothing, as it would for the draft itself.
 */
export function slotStateFor(
  proposal: CalendarProposalState | null,
  inFlight: DraftInFlight | null,
  today: string,
): CalendarSlotState | null {
  if (proposal) return proposal;
  if (inFlight && inFlight.visibleFrom <= today) return { kind: 'drafting', weekStart: inFlight.weekStart };
  return null;
}

/** Why the athlete's own ask for a second draft was refused. */
export type RedraftRefusal = 'not-declined' | 'already-planned' | 'draft-pending';

/**
 * The one way a week is drafted twice (`training-architecture/24`, decision
 * 1): the athlete declined the Coach's draft and asks for another. Allowed
 * for a declined week that holds no coach-planned session and has a plannable
 * day; refused, by name, otherwise. Then the ordinary Coach call and write —
 * `recordWeekDraft`'s guard against a pending twin is exactly right here.
 * Visible today: the athlete is looking. Never throws.
 */
export async function redraftWeek(
  athleteId: string,
  weekStart: string,
  today: string,
): Promise<DraftOutcome | RedraftRefusal> {
  const facts = await guarded(athleteId, () => redraftFacts(athleteId, weekStart, today));
  if (facts === 'coach-failed') return facts;
  if ('refused' in facts) return facts.refused;
  const { window, unavailableDates, declined } = facts;

  const asked = await askCoach(athleteId, today, window, unavailableDates, declined);
  if (typeof asked === 'string') return asked;

  const outcome = await guarded(athleteId, () =>
    recordWeekDraft({
      athleteId,
      weekStart,
      visibleFrom: today,
      sessions: asked.sessions,
      citations: asked.citations,
      skeleton: asked.skeleton,
      adjusted: asked.adjusted,
      whatChanged: asked.whatChanged,
    }),
  );
  if (outcome === 'coach-failed') return outcome;
  return outcome === 'drafted' ? 'drafted' : 'lost-race';
}

/** The re-draft's gate, as facts gathered in one round and one pure decision. */
async function redraftFacts(
  athleteId: string,
  weekStart: string,
  today: string,
): Promise<
  | { refused: DraftOutcome | RedraftRefusal }
  | { window: PlanningWindow; unavailableDates: string[]; declined: DeclinedDraft | null }
> {
  const [athlete, consent, history, sessions, unavailableDates, declined] = await Promise.all([
    getAthleteById(athleteId),
    assertAiCoachingConsent(athleteId),
    getWeekDraftHistory(athleteId, weekStart),
    getSessionsForWeek(athleteId, weekStart),
    getUnavailableDates(athleteId),
    // What was turned down, so the second answer is not the first one again
    // (`training-architecture/30`). Null for a week declined in chat.
    getLastDeclinedDraft(athleteId, weekStart),
  ]);
  const refused = redraftGate({ consented: consent.ok, history, planned: hasCoachPlannedSession(sessions) });
  if (refused) return { refused };
  const facts = profileFacts(athlete, today);
  const window = weekWindow(weekStart, today, facts.fixedConstraints, unavailableDates, facts.firstDay);
  if (!window) return { refused: 'no-window' };
  return { window, unavailableDates, declined };
}

/** Pure: the reason a re-draft is refused, or null when it may go ahead — the window is asked after. */
export function redraftGate(facts: {
  consented: boolean;
  history: ResolvedWeekDraftHistory;
  planned: boolean;
}): DraftOutcome | RedraftRefusal | null {
  if (!facts.consented) return 'consent-refused';
  if (facts.history.kind === 'pending') return 'draft-pending';
  if (facts.history.kind !== 'declined') return 'not-declined';
  if (facts.planned) return 'already-planned';
  return null;
}

/**
 * The Head Coach's app-open as a trigger: one {@link ensureWeekDrafted} per
 * athlete on their Roster (`training-architecture/16`, "whoever opens the app
 * first on or after the due day triggers it, coach or athlete"; `/17`).
 *
 * Without this the day-early preview `/17` promises could only exist if the
 * athlete happened to open the app the day before their own day — the one day
 * they have no reason to. Nothing for a user with no coach row. A failure on
 * one athlete is that athlete's outcome and the loop goes on; a coach's open
 * must not lose the second athlete's draft to the first's dead driver. Never
 * throws, like the entry point it fans out to.
 */
export async function ensureRosterDrafted(coachUserId: string, today: string): Promise<Record<string, DraftOutcome>> {
  // The two reads that find the roster are outside any athlete's boundary, so
  // they get their own: a dead driver here is nothing drafted, logged once
  // under the coach's user id, never a rejection in the shell's after().
  const roster = await guarded(coachUserId, async () => {
    const coach = await getCoachByUserId(coachUserId);
    return coach ? getRoster(coach.id) : [];
  });
  if (roster === 'coach-failed') return {};
  const outcomes: Record<string, DraftOutcome> = {};
  for (const entry of roster) {
    outcomes[entry.athleteId] = await ensureWeekDrafted(entry.athleteId, today);
  }
  return outcomes;
}

/** The facts the gate decides on, gathered in one round of reads. */
async function gateFacts(
  athleteId: string,
  today: string,
): Promise<
  { gated: DraftOutcome } | { dueWeek: string; visibleFrom: string; window: PlanningWindow; unavailableDates: string[] }
> {
  // A switched-off Coach (the page snapshot suite, local work without a key)
  // is an outcome, not a failure: nothing read, nothing embedded, nothing
  // logged. First, so grounding's OpenAI call never happens either.
  if (isCoachDisabled()) return { gated: 'coach-disabled' };
  const thisWeek = weekStartOf(today);
  const [athlete, link, unavailableDates, thisWeekSessions, thisWeekHistory] = await Promise.all([
    getAthleteById(athleteId),
    getLinkForAthlete(athleteId),
    getUnavailableDates(athleteId),
    getSessionsForWeek(athleteId, thisWeek),
    getWeekDraftHistory(athleteId, thisWeek),
  ]);
  const { weeklySessionDay, fixedConstraints, firstDay } = profileFacts(athlete, today);
  // A linked Head Coach sees the draft one day before the athlete (`/17`), so
  // the cycle is due a day early — and the athlete's own day is stamped on the
  // draft as the first day they may see it, whoever triggered it. An empty,
  // never-drafted current week comes first, visible today (`/24`,
  // `showable-version/11`).
  const { weekStart: dueWeek, visibleFrom } = dueWeekFor({
    today,
    weeklySessionDay,
    leadDays: link ? HEAD_COACH_LEAD_DAYS : 0,
    thisWeekHasCoachPlan: hasCoachPlannedSession(thisWeekSessions),
    thisWeekDrafted: thisWeekHistory.kind !== 'never',
    thisWeekWindow: weekWindow(thisWeek, today, fixedConstraints, unavailableDates, firstDay),
  });

  // Read again for the due week rather than reused when it is this week: one
  // spare read on the rarer path, and no branch nothing can tell apart.
  const [consent, history] = await Promise.all([
    assertAiCoachingConsent(athleteId),
    getWeekDraftHistory(athleteId, dueWeek),
  ]);
  const window = weekWindow(dueWeek, today, fixedConstraints, unavailableDates, firstDay);
  const gated = draftGate({ consented: consent.ok, history, window });
  // The gate's last exit is a null window, so past it the window is real.
  if (gated || !window) return { gated: gated ?? 'no-window' };
  return { dueWeek, visibleFrom, window, unavailableDates };
}

/** The two profile fields the gate reads, with a missing row or profile read as "nothing set". */
function profileFacts(athlete: Awaited<ReturnType<typeof getAthleteById>>, todayKey: string): {
  weeklySessionDay: string | undefined;
  fixedConstraints: string[];
  /** The athlete's chosen first training day, resolved against today (`/36`). */
  firstDay: string | undefined;
} {
  const profile = athlete?.profile;
  return {
    weeklySessionDay: profile?.weeklySessionDay,
    fixedConstraints: profile?.fixedConstraints ?? [],
    firstDay: chosenFirstDay(profile, todayKey),
  };
}

interface Drafted {
  sessions: ProposedSession[];
  citations: RetrievalResult['citations'];
  skeleton: SkeletonDay[];
  /** The week already held the structure's sessions (`training-architecture/40`). */
  adjusted: boolean;
  whatChanged: string | null;
}

type AskFailure = 'coach-failed' | 'malformed';

/**
 * The one Coach call: gather the week's context, ground it, ask for the
 * proposal, validate it. Returns the sessions or the outcome that explains why
 * there are none — each failure logged as the different thing it is.
 */
async function askCoach(
  athleteId: string,
  today: string,
  window: PlanningWindow,
  unavailableDates: string[],
  /** Only a re-draft passes it: the week the athlete turned down (`training-architecture/30`). */
  declined: DeclinedDraft | null = null,
): Promise<Drafted | AskFailure> {
  // Gathering and rendering sit inside the boundary with the call: rendering
  // asserts on the athlete's free text and throws, as the Weekly Session keeps it.
  const gathered = await guarded(athleteId, () => gatherContext(athleteId, today, window, unavailableDates, declined));
  if (gathered === 'coach-failed') return gathered;

  const reply = await guarded(athleteId, () =>
    callCoach({
      system: gathered.system,
      messages: [{ role: 'user', content: WEEK_DRAFT_OPENER }],
      maxTokens: DRAFT_MAX_TOKENS,
      tools: [PROPOSE_WEEK_PLAN_TOOL],
      toolResult: DRAFT_ACK,
    }),
  );
  if (reply === 'coach-failed') return reply;

  const proposal = proposalFrom(athleteId, reply, window);
  if (!proposal) return 'malformed';
  return {
    ...proposal,
    citations: gathered.grounding.citations,
    skeleton: gathered.skeleton,
    adjusted: gathered.adjusted,
  };
}

/** Runs one step of the draft; a throw is logged as this surface's failure and named, never rethrown. */
async function guarded<T>(athleteId: string, step: () => Promise<T>): Promise<T | 'coach-failed'> {
  try {
    return await step();
  } catch (error) {
    logCoachFailure({ surface: 'week_draft', athleteId, conversationId: null, error });
    return 'coach-failed';
  }
}

/**
 * The proposed sessions the server accepts, or null — logged with the reason
 * (no tool call, or what the validator refused), since the draft has no
 * conversation for the Coach's words to land in.
 */
function proposalFrom(
  athleteId: string,
  reply: CoachReply,
  window: PlanningWindow,
): { sessions: ProposedSession[]; whatChanged: string | null } | null {
  const call = reply.toolCalls.find((c) => c.name === PROPOSE_WEEK_PLAN_TOOL_NAME);
  if (!call) {
    logCoachFailure({ surface: 'week_draft', athleteId, conversationId: null, error: new Error('no tool call') });
    return null;
  }
  const validated = validateProposedPlan(call.input, window);
  if (!validated.ok) {
    logCoachFailure({
      surface: 'week_draft',
      athleteId,
      conversationId: null,
      error: new Error(`proposal refused: ${validated.reason}`),
    });
    return null;
  }
  return { sessions: validated.sessions, whatChanged: whatChangedFrom(call.input) };
}

/** The prompt, the skeleton it was built from, and the grounding it carried. */
async function gatherContext(
  athleteId: string,
  today: string,
  window: PlanningWindow,
  unavailableDates: string[],
  declined: DeclinedDraft | null,
): Promise<{ system: string; skeleton: SkeletonDay[]; grounding: RetrievalResult; adjusted: boolean }> {
  const weekStart = weekStartOf(today);
  // The drafted week, not this one: the history the draft reads counts back
  // from the week it is writing (`training-architecture/44`).
  const draftedWeek = weekStartOf(window.start);
  const [athlete, weekSessions, equipmentItems, horizon, checkInRow, capacity, races, presenceStage, pastSessions, language] =
    await Promise.all([
      getAthleteById(athleteId),
      getSessionsForWeek(athleteId, weekStart),
      getEquipmentItems(athleteId),
      getResolvedBlocks(athleteId, today),
      getCheckInForWeek(athleteId, weekStart),
      // The capacity half only; the detail thread has no reader here (ADR 0011).
      capacityFor(athleteId),
      // Every race, so the draft knows a tune-up from the target (slice 09). No
      // plan-written-at: the draft is the plan being written, so nothing is late
      // relative to it yet.
      getRaces(athleteId),
      // How much the Coach actually has on this athlete (`training-architecture/21`).
      getPresenceStage(athleteId),
      // What the athlete actually did in the four weeks before the drafted one.
      getSessionsInRange(athleteId, addDays(draftedWeek, -7 * RECENT_WEEKS), draftedWeek),
      // The Athlete Language, by this athlete's id: a Head Coach's app-open
      // drafts too, so it cannot be whoever is signed in (showable-version/46).
      getLanguageForAthlete(athleteId),
    ]);
  if (!athlete) throw new Error('athlete row missing');

  const checkIn = buildWeeklyCheckIn(
    athlete,
    today,
    readinessFrom(checkInRow),
    presenceStage,
    language ?? undefined,
    equipmentItems,
    horizon.race ? { name: horizon.race.name, date: horizon.race.date } : null,
    capacity,
    notableSignalFrom(checkInRow),
    races,
    null,
    horizon.blocks,
  );

  const skeleton = weekSkeleton(window);
  // The week the structure already wrote, if it wrote one
  // (`training-architecture/34`): the Coach adjusts what the athlete has seen
  // rather than inventing a week from a skeleton of roles.
  const baseline = await getArithmeticSessionsForWeek(athleteId, draftedWeek);
  const grounding = await ground(athleteId, groundingFacts(athlete, horizon.blocks, today));

  const ctx = {
    ...buildWeeklyContext(checkIn, weekFeedbackFrom(weekSessions), unavailableDates, today),
    window,
    skeleton,
    baseline,
    recentWeeks: fourWeekSummary(pastSessions, draftedWeek, today),
    declined,
    passages: grounding.passages,
    citations: grounding.citations,
  };
  // The fact the narration needs and cannot recover later: the draft adjusted
  // a week the structure had filled, rather than filling an empty one.
  return { system: renderWeekDraftPrompt(ctx), skeleton, grounding, adjusted: baseline.length > 0 };
}

const NO_GROUNDING: RetrievalResult = { passages: [], citations: [] };

/** What the corpus is asked about: this athlete's distance, block and experience, each only when known. */
function groundingFacts(athlete: Athlete, blocks: TrainingBlock[], today: string): GroundingFacts {
  const block = currentBlock(today, blocks);
  return {
    distance: athlete.raceDistance ?? undefined,
    phase: block?.name,
    position: block ? blockPosition(today, block) : null,
    experienceLevel: athlete.experienceLevel ?? undefined,
  };
}

/** One fixed sentence per situation — prose, because it is embedded and compared against papers. */
export function groundingQuestion(facts: GroundingFacts): string {
  const who = facts.distance ? `a ${facts.distance} triathlete` : 'a triathlete';
  if (!facts.phase) return `How should ${who} structure a training week with no race booked?`;
  const week = facts.position ? `, week ${facts.position.week} of ${facts.position.weeks}` : '';
  return `How should ${who} structure a training week in the ${facts.phase} phase${week}?`;
}

interface GroundingFacts {
  distance?: string;
  phase?: string;
  position: { week: number; weeks: number } | null;
  experienceLevel?: string;
}

/**
 * One retrieval, before the prompt is rendered — the direct call, not the
 * per-turn lookup tool `knowledge-oracle/05` gives the conversation. A thrown
 * retrieval (no embedder key, a dead search) is logged and the draft goes
 * ahead ungrounded, with the prompt saying so; the science is a help, not a
 * gate.
 */
async function ground(athleteId: string, facts: GroundingFacts): Promise<RetrievalResult> {
  const question = groundingQuestion(facts);
  try {
    return await retrievePassages({
      embedder: openAiEmbedder(),
      search: knowledgeSearch(),
      // The question already names the distance and the block where they
      // matter (`groundingQuestion`); nothing is prefixed onto it. Rendered to
      // the embedded string by `retrievePassages`, where the identifier
      // assertion on it lives.
      query: { question },
    });
  } catch (error) {
    logCoachFailure({ surface: 'week_draft', athleteId, conversationId: null, error });
    return NO_GROUNDING;
  }
}
