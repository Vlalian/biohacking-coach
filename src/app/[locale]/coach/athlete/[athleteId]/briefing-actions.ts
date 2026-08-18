'use server';

import { resolveCoachWithLanguage } from '../../../current-actor';
import { dateKey } from '@/lib/date';
import {
  continueBriefing,
  startBriefing,
  type ContinueBriefingResult,
  type StartBriefingResult,
} from '@/features/coach/briefing-service';

/**
 * Server actions for the Coach Briefing — the seam the briefing UI calls.
 *
 * The acting coach is resolved here from the authenticated session, never the
 * request: the client sends only *which* athlete and *what* to say, never *who*
 * is asking. The link gate, the ownership gate, and Link Visibility all live in
 * the service (ADR 0006); these actions add authentication and pass the coach's
 * language through the user seam (`ui_prefs`), like the Weekly Session's do.
 */

type AuthFailure = { ok: false; reason: 'not-a-coach' };

export async function startBriefingAction(
  athleteId: string,
): Promise<StartBriefingResult | AuthFailure> {
  const resolved = await resolveCoachWithLanguage();
  if (!resolved.ok) return resolved;

  return startBriefing(
    resolved.coachId,
    athleteId,
    dateKey(new Date()),
    resolved.language,
  );
}

export async function sendBriefingMessageAction(
  conversationId: string,
  content: string,
): Promise<ContinueBriefingResult | AuthFailure> {
  const resolved = await resolveCoachWithLanguage();
  if (!resolved.ok) return resolved;

  return continueBriefing(
    resolved.coachId,
    conversationId,
    content,
    dateKey(new Date()),
    resolved.language,
  );
}
