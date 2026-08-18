-- Narrow the conversation `kind` set from six to four.
--
-- `negotiation` and `reflection` are removed. Neither was ever written: greped
-- across src/ before writing this migration rather than assumed, because a
-- tightened CHECK will reject rows it does not know about, and a wrong
-- assumption here breaks writes rather than failing loudly at deploy.
--
-- Session Negotiation is a *behavior* inside Coach Chat, carrying the Session as
-- a Reference (CONTEXT.md, decided 2026-08-12) — not a conversation kind; giving
-- it one would recreate a surface ADR-0007 retired. A Session Reflection is two
-- RPE ratings and an optional comment stored against the session, not a
-- transcript. `onboarding` stays: onboarding-service writes it.
--
-- The DELETE is a guard, not a data migration — it removes rows the constraint
-- would reject, and it is expected to affect zero rows. Without it, this
-- migration fails on any database that somehow holds one, which is a worse
-- outcome than dropping a transcript for a feature that never shipped.
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_kind_valid";--> statement-breakpoint
DELETE FROM "conversations" WHERE "kind" IN ('negotiation', 'reflection');--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_valid" CHECK ("conversations"."kind" IN ('weekly_session', 'coach_chat', 'onboarding', 'coach_briefing'));
