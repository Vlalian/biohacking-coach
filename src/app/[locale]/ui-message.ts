import type { MessageRating } from '@/db/schema';
import type { Citation } from '@/lib/citation';

/**
 * The lean message shape a transcript renders — no server-only fields.
 *
 * Lived in `weekly-session.tsx` while that screen existed; the Weekly Session
 * is retired (`training-architecture/21`) and every remaining transcript —
 * Coach Chat, the Feedback Interview — imports the shape from here.
 */
export interface UiMessage {
  id: string;
  role: 'athlete' | 'coach_ai' | 'head_coach';
  content: string;
  seq: number;
  /**
   * The sources behind this turn, or none (code-health/06). Always a list, so a
   * renderer asks one question rather than two, and an empty one renders nothing
   * at all.
   */
  citations: Citation[];
  /**
   * This tester's own thumbs on this message, or none yet
   * (`showable-version/05`, item 3). Passed from the server so a flag left last
   * week is still there on load - a mark that vanishes on reload teaches the
   * tester the button does nothing.
   */
  rating?: { rating: MessageRating; comment: string | null } | null;
}
