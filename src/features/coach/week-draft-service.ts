import { logCoachFailure } from '@/lib/coach-log';
import { weekStartOf } from '@/lib/date';
import { getAthleteById } from '@/features/athlete/athlete-repository';
import { getEquipmentItems } from '@/features/equipment/equipment-repository';
import { getUnavailableDates } from '@/features/availability/availability-repository';
import { getSessionsForWeek } from '@/features/session/session-repository';
import { capacityFor } from '@/features/health/health-repository';
import { assertAiCoachingConsent } from '@/features/consent/consent-gate';
import { openAiEmbedder } from '@/features/knowledge-oracle/embedder';
import { knowledgeSearch } from '@/features/knowledge-oracle/knowledge-repository';
import { retrievePassages, type RetrievalResult } from '@/features/knowledge-oracle/retrieval';
import type { PlanningWindow } from './planning-window';
import { callCoach, type CoachReply } from './coach-client';
import { buildWeeklyContext, renderWeekDraftPrompt } from './prompts';
import { getCheckInForWeek } from './check-in-repository';
import { readinessFrom, notableSignalFrom } from './check-in';
import { hasHeldWeeklySessionInWeek } from './conversation-repository';
import { getResolvedBlocks } from './training-block-service';
import { blockPosition, currentBlock, type TrainingBlock } from './training-blocks';
import type { Athlete } from '@/features/athlete/athlete';
import {
  buildWeeklyCheckIn,
  PROPOSE_WEEK_PLAN_TOOL,
  PROPOSE_WEEK_PLAN_TOOL_NAME,
  validateProposedPlan,
  weekFeedbackFrom,
  skippedFrom,
  type ProposedSession,
} from './weekly-session';
import { draftDueWeek, weekSkeleton, weekWindow, WEEK_DRAFT_OPENER, type SkeletonDay } from './week-draft';
import { getPendingWeekDraft, recordWeekDraft } from './week-draft-repository';

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
  | 'already-held'
  | 'no-window'
  | 'coach-failed'
  | 'malformed'
  | 'lost-race'
  | 'drafted';

/**
 * The cheap gate, as a pure decision over the facts the service gathered.
 *
 * Its own function so the six early exits are six lines here rather than six
 * guards in the entry point — the shape that put the discarded `04a` build over
 * the complexity ceiling.
 */
export function draftGate(facts: {
  consented: boolean;
  pending: boolean;
  held: boolean;
  window: PlanningWindow | null;
}): Exclude<DraftOutcome, 'coach-failed' | 'malformed' | 'lost-race' | 'drafted'> | null {
  if (!facts.consented) return 'consent-refused';
  if (facts.pending) return 'already-drafted';
  if (facts.held) return 'already-held';
  if (!facts.window) return 'no-window';
  return null;
}

/**
 * Makes sure this athlete's due week has a drafted proposal, drafting one if
 * it does not. Idempotent and cheap on the common path: a handful of reads,
 * then nothing. Never throws.
 */
export async function ensureWeekDrafted(athleteId: string, today: string): Promise<DraftOutcome> {
  const facts = await gateFacts(athleteId, today);
  if ('gated' in facts) return facts.gated;
  const { dueWeek, window, unavailableDates } = facts;

  const asked = await askCoach(athleteId, today, window, unavailableDates);
  if (typeof asked === 'string') return asked;

  const outcome = await recordWeekDraft({
    athleteId,
    weekStart: dueWeek,
    // 17 moves this a day later than the Head Coach's; for a solo athlete the
    // draft is theirs the moment it exists.
    visibleFrom: today,
    sessions: asked.sessions,
    citations: asked.citations,
    skeleton: asked.skeleton,
  });
  return outcome === 'drafted' ? 'drafted' : 'lost-race';
}

/** The facts the gate decides on, gathered in one round of reads. */
async function gateFacts(
  athleteId: string,
  today: string,
): Promise<{ gated: DraftOutcome } | { dueWeek: string; window: PlanningWindow; unavailableDates: string[] }> {
  const athlete = await getAthleteById(athleteId);
  const { weeklySessionDay, fixedConstraints } = profileFacts(athlete);
  const dueWeek = draftDueWeek(today, weeklySessionDay);

  const [consent, pending, held, unavailableDates] = await Promise.all([
    assertAiCoachingConsent(athleteId),
    getPendingWeekDraft(athleteId, dueWeek),
    hasHeldWeeklySessionInWeek(athleteId, dueWeek),
    getUnavailableDates(athleteId),
  ]);
  const window = weekWindow(dueWeek, today, fixedConstraints, unavailableDates);
  const gated = draftGate({ consented: consent.ok, pending: pending !== null, held, window });
  // The gate's last exit is a null window, so past it the window is real.
  if (gated || !window) return { gated: gated ?? 'no-window' };
  return { dueWeek, window, unavailableDates };
}

/** The two profile fields the gate reads, with a missing row or profile read as "nothing set". */
function profileFacts(athlete: Awaited<ReturnType<typeof getAthleteById>>): {
  weeklySessionDay: string | undefined;
  fixedConstraints: string[];
} {
  const profile = athlete?.profile;
  return {
    weeklySessionDay: profile?.weeklySessionDay,
    fixedConstraints: profile?.fixedConstraints ?? [],
  };
}

interface Drafted {
  sessions: ProposedSession[];
  citations: RetrievalResult['citations'];
  skeleton: SkeletonDay[];
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
): Promise<Drafted | AskFailure> {
  // Gathering and rendering sit inside the boundary with the call: rendering
  // asserts on the athlete's free text and throws, as the Weekly Session keeps it.
  const gathered = await guarded(athleteId, () => gatherContext(athleteId, today, window, unavailableDates));
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

  const sessions = proposalFrom(athleteId, reply, window);
  if (!sessions) return 'malformed';
  return { sessions, citations: gathered.grounding.citations, skeleton: gathered.skeleton };
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
function proposalFrom(athleteId: string, reply: CoachReply, window: PlanningWindow): ProposedSession[] | null {
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
  return validated.sessions;
}

/** The prompt, the skeleton it was built from, and the grounding it carried. */
async function gatherContext(
  athleteId: string,
  today: string,
  window: PlanningWindow,
  unavailableDates: string[],
): Promise<{ system: string; skeleton: SkeletonDay[]; grounding: RetrievalResult }> {
  const weekStart = weekStartOf(today);
  const [athlete, weekSessions, equipmentItems, horizon, checkInRow, capacity] = await Promise.all([
    getAthleteById(athleteId),
    getSessionsForWeek(athleteId, weekStart),
    getEquipmentItems(athleteId),
    getResolvedBlocks(athleteId, today),
    getCheckInForWeek(athleteId, weekStart),
    // The capacity half only; the detail thread has no reader here (ADR 0011).
    capacityFor(athleteId),
  ]);
  if (!athlete) throw new Error('athlete row missing');

  const checkIn = buildWeeklyCheckIn(
    athlete,
    today,
    readinessFrom(checkInRow),
    0,
    undefined,
    equipmentItems,
    horizon.race ? { name: horizon.race.name, date: horizon.race.date } : null,
    capacity,
    notableSignalFrom(checkInRow),
    horizon.blocks,
  );

  const skeleton = weekSkeleton(window);
  const grounding = await ground(athleteId, groundingFacts(athlete, horizon.blocks, today));

  const ctx = {
    ...buildWeeklyContext(checkIn, weekFeedbackFrom(weekSessions), [], skippedFrom(weekSessions), unavailableDates, null, today),
    window,
    skeleton,
    passages: grounding.passages,
    citations: grounding.citations,
  };
  return { system: renderWeekDraftPrompt(ctx), skeleton, grounding };
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
      // Rendered to the embedded string by `retrievePassages` itself, which
      // is also where the identifier assertion on it lives.
      query: { question, phase: facts.phase, experienceLevel: facts.experienceLevel },
    });
  } catch (error) {
    logCoachFailure({ surface: 'week_draft', athleteId, conversationId: null, error });
    return NO_GROUNDING;
  }
}
