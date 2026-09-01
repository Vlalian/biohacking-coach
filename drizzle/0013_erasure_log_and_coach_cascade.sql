-- Erasure: the append-only log, and the cascade that makes a Head Coach
-- account deletable at all (`showable-version/10`, decided 2026-08-27).
--
-- NUMBERING. This was written as 0012 and regenerated as 0013 on 2026-09-01.
-- Four branches had independently claimed 0012; `main` took
-- `0012_knowledge_oracle_corpus.sql` when PR #42 merged, so this one was
-- renumbered at merge time exactly as its earlier note said it would be. It was
-- REGENERATED rather than renamed: the journal and the snapshot have to agree
-- with the filename, so a text-level rename would have left drizzle's
-- bookkeeping describing a migration that does not exist. Two branches still
-- claim 0012 (`claude/clapet-system-design-convert-65316a`,
-- `fix/detected-activity-proposes`); whichever merges next does this again.
--
-- 1. `erasure_log` — deliberately keyed to NOBODY.
--
-- There is no `athlete_id`, no `user_id`, and no foreign key, and none of those
-- is an oversight. Every other table in this schema hangs off `athlete.id`, so
-- the instinct on reading this is that a key was forgotten. The table exists to
-- record *that* an account consented to a set of purposes and was then erased,
-- while carrying nothing that could say whose account it was. A key here would
-- undo the erasure it exists to document.
--
-- Why keep anything at all: Article 7(1) asks a controller to be able to
-- demonstrate that consent was given. `consent` rows cascade away with the
-- athlete, which destroys that proof; retaining them keeps a record about
-- someone who asked to be forgotten. This is the third option — the
-- demonstrable fact without the person attached. It also makes the erasure
-- itself auditable, which letting the cascade take the consent rows in silence
-- does not.
--
-- This works because of ADR 0006: `consent` was already keyed on the opaque
-- athlete id and carried no name or email, so once the `athlete` and `user`
-- rows are gone the re-identification key has been destroyed by the erasure
-- itself. Recorded in `gdpr-decisions.md` for the privacy review.
--
-- `consented_purposes` keeps each purpose with the version it was granted
-- under rather than collapsing them to one. `grantConsent` supersedes only the
-- purpose being granted, so an optional purpose granted under an older
-- disclosure stays active at that older version while the required ones move
-- forward. One version across all of them would misstate what was agreed to.
--
-- 2. `conversations.coach_id` gains ON DELETE CASCADE.
--
-- This is load-bearing, not tidying. The column declared no ON DELETE at all,
-- so it defaulted to NO ACTION. A Coach Briefing carries `coach_id` = the coach
-- and `athlete_id` = *the athlete it is about*, so a coach's briefings about
-- other athletes are keyed to those athletes' ids and are untouched by the
-- coach's own erasure. The coach row stayed referenced and DELETE FROM coach
-- threw a foreign-key violation — meaning erasure worked for athletes and not
-- for Head Coaches, which is half the tester audience
-- (`showable-version/04`), and CONTEXT.md is explicit that one account can hold
-- both capacities at once.
--
-- Erasing a coach now takes their briefings with them. That is right: a
-- briefing is that coach's own account of their coaching, and it is theirs to
-- take with them.
--
-- IF EXISTS on the drop, matching 0011 — the constraint is expected to be
-- there, and a migration that fails on a database where it is not is a worse
-- outcome than one that proceeds. drizzle-kit generates a bare DROP CONSTRAINT;
-- this line is deliberately hand-edited, and safe to edit because the migration
-- has not been applied anywhere yet.
CREATE TABLE "erasure_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consented_purposes" jsonb NOT NULL,
	"disclosure_version" text NOT NULL,
	"erased_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_coach_id_coach_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_coach_id_coach_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach"("id") ON DELETE cascade ON UPDATE no action;
