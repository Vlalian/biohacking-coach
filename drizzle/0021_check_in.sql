-- training-architecture/05 — the Check-in, and the end of the fabricated readiness.
--
-- ONCE PER WEEK, NOT DAILY. `week_start` is the Monday the report belongs to,
-- and `check_in_once_per_week` is what makes "once" a database rule rather than
-- a convention. A second filing for the same week replaces the first: an athlete
-- correcting Monday's answer on Tuesday is editing one report, not filing two.
--
-- ALL THREE SCORES ARE NOT NULL, TOGETHER. Half a Check-in is not a Check-in —
-- a partial one would render to the Coach as no readiness at all *and* have the
-- prompt say there is none, a false claim in the opposite direction
-- (code-health/07). The database refuses it rather than trusting the form.
--
-- There is deliberately NO sleep-duration and NO resting-pulse column. Those are
-- expected from a device (Garmin or similar) rather than from a weekly question
-- (Mads, 2026-09-09) — asking an athlete to measure a resting pulse every Monday
-- is a worse product than reading one already measured. Until a feed exists the
-- Coach is told, in its own prompt block, that it cannot see them.
--
-- `notable_signal` is free text and NOT a score. "Tweaked my calf on Thursday"
-- is not a number, and it is the only part of a Check-in the athlete writes in
-- their own words. It reaches a prompt, so it passes the same identifier
-- assertion every other free-text leaf does.

CREATE TABLE "check_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"energy" integer NOT NULL,
	"body" integer NOT NULL,
	"sleep_quality" integer NOT NULL,
	"notable_signal" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "check_in_scores_in_range" CHECK ("check_in"."energy" BETWEEN 1 AND 10 AND "check_in"."body" BETWEEN 1 AND 10 AND "check_in"."sleep_quality" BETWEEN 1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_once_per_week" ON "check_in" USING btree ("athlete_id","week_start");