import { composeNarration, type Translate, type WeekdayOf } from './narration';
import { getCoachFirstNames } from './coach-repository';
import { createConversation, getLatestOpenConversation } from './conversation-repository';
import { claimAndNarrate, getPendingNarrationEvents } from './narration-repository';

/**
 * Narration's edge: read what the Head Coach did, say it, mark it said.
 *
 * ADR-0003's "no silent plan mutations" is the rule this closes. The event side
 * has always been recorded; this is the announcement side, un-benched for the
 * first showing where a real Head Coach and a real athlete are different people
 * (`coached-mode/03`).
 *
 * **Runs on app-open**, from the shell layout, rather than at the next Weekly
 * Session. The Weekly Session is offered and never forced (ADR-0007), so
 * hanging narration off it would mean an athlete who dismisses the offer never
 * learns their plan changed — the exact failure the rule forbids. This is a
 * documented default, not a validated design: the manner-and-timing question
 * was flagged for an interview that has since been dropped, so it validates
 * against the first real Head Coach's athlete instead.
 *
 * **No Anthropic call.** The message is composed from the event payload
 * ({@link composeNarration}), which is what keeps this cheap enough to sit on a
 * render path, and keeps the Coach from inventing detail about a change the
 * athlete did not make.
 *
 * The athlete id is always the one resolved from the authenticated session
 * upstream; every query below is scoped to it (ADR 0006).
 */
export async function narratePendingEvents(
  athleteId: string,
  t: Translate,
  weekdayOf: WeekdayOf,
): Promise<void> {
  // The overwhelmingly common case, and it runs on every View navigation: one
  // indexed read, nothing else. Everything past this line is the rare path
  // where a Head Coach has actually been in the plan.
  const pending = await getPendingNarrationEvents(athleteId);
  if (pending.length === 0) return;

  const actorIds = [...new Set(pending.flatMap((e) => (e.actorId ? [e.actorId] : [])))];
  const [coachFirstNames, openChat] = await Promise.all([
    getCoachFirstNames(actorIds),
    getLatestOpenConversation(athleteId, 'coach_chat'),
  ]);

  const content = composeNarration(pending, coachFirstNames, t, weekdayOf);
  // Defensive: the composer only returns null for an empty list, which is
  // already handled. Checked anyway so a future change there can never mint a
  // conversation to hold nothing.
  if (!content) return;

  // Coach Chat is created lazily on the athlete's first message, so an athlete
  // whose Head Coach acted before they ever spoke to the Coach has nothing to
  // append to. Minting one here is deliberate: the Coach genuinely has
  // something to say, which is the same bar the send path uses.
  const conversationId =
    openChat?.id ??
    (await createConversation({ athleteId, kind: 'coach_chat' })).id;

  await claimAndNarrate({
    athleteId,
    eventIds: pending.map((e) => e.id),
    conversationId,
    content,
  });
}
