-- training-architecture/02 — a Race becomes an entity, and the horizon a field.
--
-- `athlete.race_distance` lands nullable and is DELIBERATELY NOT BACKFILLED.
-- Every athlete who onboarded before this column existed was never asked, and a
-- Race Distance is not derivable from `race_target`'s free text — deriving one
-- from prose is exactly the habit this slice removed (four regexes over the
-- race name, with a silent fallback when none matched). Null therefore means
-- "never asked", not "no distance", and the Coach prompt says the distance is
-- unknown rather than assuming one. Those athletes are asked in Settings.
--
-- `race_target` is left in place and still written: the Coach's session-1 arc
-- and the onboarding greeting both read it. The Race row is authoritative for
-- the date; retiring the column is a later slice's job, not this one's.

CREATE TABLE "race" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"distance" text NOT NULL,
	"is_target" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "race_distance_known" CHECK (distance IN ('Sprint', 'Olympic', 'Half', 'Full'))
);
--> statement-breakpoint
ALTER TABLE "athlete" ADD COLUMN "race_distance" text;--> statement-breakpoint
ALTER TABLE "race" ADD CONSTRAINT "race_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_one_target_per_athlete" ON "race" USING btree ("athlete_id") WHERE "race"."is_target";--> statement-breakpoint
CREATE INDEX "race_athlete_date" ON "race" USING btree ("athlete_id","date");