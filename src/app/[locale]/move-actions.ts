'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import { moveSession, type MoveResult } from '@/features/session/session-move';
import { dateKey, isValidDateKey } from '@/lib/date';

/**
 * Server action for a Session Move.
 *
 * The acting athlete is resolved here, from the authenticated session — the
 * client sends only which session to move and where. `today` is the server's,
 * not the browser's, so the Move rules are judged against a clock the client
 * cannot spoof. All the authority lives in {@link moveSession}; this just wires
 * the request to it and revalidates the calendar on success.
 */
export async function moveSessionAction(
  sessionId: string,
  targetDate: string,
): Promise<MoveResult> {
  // The target date is untrusted client input; reject anything that is not a
  // real 'YYYY-MM-DD' before it reaches the rules or the database.
  if (!isValidDateKey(targetDate)) return { ok: false, reason: 'bounce' };

  // Signed in but no athlete row to act as is not a valid actor for a move.
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await moveSession({
    athleteId,
    sessionId,
    targetDate,
    today: dateKey(new Date()),
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
