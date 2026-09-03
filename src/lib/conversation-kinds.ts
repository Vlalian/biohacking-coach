/**
 * The closed set of conversation kinds — the single list both the database CHECK
 * constraint and the `ConversationKind` union are built from.
 *
 * Was six until 2026-08-18 (`negotiation` and `reflection` were never written by
 * any code path; migration 0011 removed them). `feedback` joined 2026-09-01 with
 * the Feedback Interview (`showable-version/07`): an interview is deliberately
 * *not* a coaching behaviour, which is the argument for its own kind rather than
 * hiding it inside `coach_chat`, where it would be resent to the Coach as
 * training talk on every later turn.
 *
 * It lives in `lib/` rather than in either of its two consumers, and that is the
 * whole point of the module. It was first written into `db/schema.ts`, which
 * made `features/coach/conversation.ts` — a pure core module — take a *runtime*
 * import on the database layer, against AGENTS.md's "the core imports nothing
 * from features, UI, or the database layer". Moving it the other way would have
 * had the schema reach into a feature instead. `lib/` is the floor both can
 * stand on: it imports nothing, exactly as `lib/identifiers.ts` does for the
 * same reason.
 */
export const CONVERSATION_KINDS = [
  'weekly_session',
  'coach_chat',
  'onboarding',
  'coach_briefing',
  'feedback',
] as const;

export type ConversationKind = (typeof CONVERSATION_KINDS)[number];
