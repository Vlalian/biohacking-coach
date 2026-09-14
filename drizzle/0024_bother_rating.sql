-- training-architecture/06 - the Bother Rating (Mads, 2026-09-11).
--
-- An optional 1-5 answer to "how much is it bothering you today?" on an Injury
-- or an Illness. FOR HUMAN EYES ONLY: shown to the athlete and the Head Coach,
-- never to the Coach and never a planner input. The planner reads capacity (what
-- the athlete can do, per discipline); a number cannot say whether swimming is
-- fine. Slices 04 and 10 ruled out a severity dial as a planner input, and this
-- is deliberately not one - it lives on ADR 0011's detail-thread side, and a
-- structural test pins that nothing on the prompt path names the column.
--
-- 1-5, not 1-7, to match every other scale the athlete meets.
--
-- Generated, NOT applied. Goes in with the rest of the batch once reviewed.
ALTER TABLE "illness" ADD COLUMN "bother" integer;--> statement-breakpoint
ALTER TABLE "injury" ADD COLUMN "bother" integer;--> statement-breakpoint
ALTER TABLE "illness" ADD CONSTRAINT "illness_bother_range" CHECK ("illness"."bother" IS NULL OR "illness"."bother" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "injury" ADD CONSTRAINT "injury_bother_range" CHECK ("injury"."bother" IS NULL OR "injury"."bother" BETWEEN 1 AND 5);