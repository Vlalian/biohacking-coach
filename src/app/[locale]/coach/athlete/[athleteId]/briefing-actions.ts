'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getCoachByUserId } from '@/features/coach/coach-repository';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';
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

async function currentCoach(): Promise<
  { ok: true; coachId: string; language?: string } | AuthFailure
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-a-coach' };
  const coach = await getCoachByUserId(session.user.id);
  if (!coach) return { ok: false, reason: 'not-a-coach' };
  const prefs = await getUiPrefs(session.user.id);
  return { ok: true, coachId: coach.id, language: prefs.language };
}

export async function startBriefingAction(
  athleteId: string,
): Promise<StartBriefingResult | AuthFailure> {
  const resolved = await currentCoach();
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
  const resolved = await currentCoach();
  if (!resolved.ok) return resolved;

  return continueBriefing(
    resolved.coachId,
    conversationId,
    content,
    dateKey(new Date()),
    resolved.language,
  );
}
