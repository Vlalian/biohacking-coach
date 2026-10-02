import type { Session } from '@/features/session/session';
import type { SessionMoveFact } from '@/features/session/session-move-repository';
import { logPatternsDetected, type PatternSurface } from '@/lib/coach-log';
import type { LinkVisibility } from './link-visibility';
import { detectPatterns, patternHistoryOf, topPatterns, visiblePatterns, type Pattern } from './pattern-insight';

/**
 * The step Coach Chat and the Briefing share (`training-architecture/50`):
 * detect from the history the context read, log every detection whether or not
 * it is handed over (ruling 7, so the threshold can be tuned), and hand over
 * the strongest three (ruling 8). The Briefing passes the link's visibility,
 * and a pattern built from reports the athlete does not share never reaches it
 * (ruling 10). Kept apart from `pattern-insight.ts` so that stays pure.
 */
export function surfacePatterns(
  athleteId: string,
  surface: PatternSurface,
  context: { patternSessions: Session[]; patternMoves: SessionMoveFact[] },
  today: string,
  visibility?: LinkVisibility,
): Pattern[] {
  const found = detectPatterns({ sessions: patternHistoryOf(context.patternSessions), moves: context.patternMoves, today });
  const shown = topPatterns(visibility ? visiblePatterns(found, visibility) : found);
  logPatternsDetected(athleteId, surface, found, shown);
  return shown;
}
