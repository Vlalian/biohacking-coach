'use server';

import { assertAiCoachingConsent } from '@/features/consent/consent-gate';
import { dateKey } from '@/lib/date';
import { resolveAthleteWithLanguage, type AuthFailure } from './current-athlete';
import {
  sendCoachChatMessage,
  type SendChatResult,
} from '@/features/coach/coach-chat-service';

/**
 * Server action for Coach Chat — the Coach Overlay's baseline mode.
 *
 * Same two-layer shape as `weekly-actions.ts`: the athlete is resolved here
 * from the authenticated session (authentication), and the service checks any
 * client-supplied conversation or Reference id against that owner (authority,
 * ADR 0006). The consent gate runs before any prompt is assembled — no valid
 * current-version consent, no AI call (gdpr-decisions item A).
 *
 * Deliberately does NOT revalidate: a chat turn changes no server-rendered
 * View, and revalidating the layout on every message would re-fetch the whole
 * shell mid-conversation.
 */

type ConsentFailure = { ok: false; reason: 'consent-required' };

export async function sendCoachChatMessageAction(input: {
  conversationId: string | null;
  content: string;
  /** The Session the athlete tapped "Discuss with Coach" on, if any. */
  referenceSessionId?: string | null;
}): Promise<SendChatResult | AuthFailure | ConsentFailure> {
  const resolved = await resolveAthleteWithLanguage();
  if (!resolved.ok) return resolved;

  const gate = await assertAiCoachingConsent(resolved.athlete.id);
  if (!gate.ok) return { ok: false, reason: 'consent-required' };

  return sendCoachChatMessage(
    resolved.athlete,
    input.conversationId,
    input.content,
    dateKey(new Date()),
    resolved.language,
    input.referenceSessionId ?? null,
  );
}
