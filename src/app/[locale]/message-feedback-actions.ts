'use server';

import {
  clearMessageRating,
  flaggableCoachMessage,
  rateMessage,
} from '@/features/feedback/message-feedback-repository';
import { MESSAGE_RATINGS, type MessageRating } from '@/db/schema';
import { resolveAthleteId, type AuthFailure } from './current-actor';

/**
 * Server actions for the thumbs on a Coach message (`showable-version/05`,
 * item 3).
 *
 * Deliberately **not** gated on AI consent, and for the same reason the Feedback
 * Interview's escape hatch is not: no model is called, and a tester whose Coach
 * is misbehaving is exactly the tester whose thumbs-down matters most. Nor is it
 * gated on the optional `product_improvement` purpose — gating feedback on an
 * optional purpose silences the people it exists for (decided 2026-09-01).
 *
 * The athlete is resolved from the session here and never taken from the
 * payload, so a client that supplies its own athlete id changes nothing (ADR
 * 0006). The message id *is* client-supplied, which is why every action checks
 * it against this athlete's own conversations before writing.
 *
 * No `revalidatePath`: a flag changes no server-rendered View.
 */

/** The one-line comment is a tester's own words; long ones are the interview's job. */
const MAX_COMMENT = 280;

type RateFailure = { ok: false; reason: 'not-flaggable' | 'bad-rating' };

export async function rateMessageAction(input: {
  messageId: string;
  rating: string;
  comment?: string | null;
}): Promise<{ ok: true } | AuthFailure | RateFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  if (!isRating(input.rating)) return { ok: false, reason: 'bad-rating' };
  if (!(await flaggableCoachMessage(athleteId, input.messageId))) {
    return { ok: false, reason: 'not-flaggable' };
  }

  await rateMessage({
    athleteId,
    messageId: input.messageId,
    rating: input.rating,
    comment: trimmedComment(input.comment),
  });
  return { ok: true };
}

export async function clearMessageRatingAction(input: {
  messageId: string;
}): Promise<{ ok: true } | AuthFailure | RateFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  if (!(await flaggableCoachMessage(athleteId, input.messageId))) {
    return { ok: false, reason: 'not-flaggable' };
  }

  await clearMessageRating({ athleteId, messageId: input.messageId });
  return { ok: true };
}

function isRating(value: string): value is MessageRating {
  return (MESSAGE_RATINGS as readonly string[]).includes(value);
}

/** Blank is absence, not an empty comment, so it stores as null. */
function trimmedComment(comment?: string | null): string | null {
  const trimmed = comment?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, MAX_COMMENT);
}
