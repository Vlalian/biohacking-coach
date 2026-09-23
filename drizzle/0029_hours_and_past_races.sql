-- training-architecture/35: onboarding asks hours per week, and past races
-- become a list.
--
-- `athlete.hours_per_week` is the ceiling every week is sized within. Existing
-- athletes stay null — never asked, not zero — and the arithmetic (34) treats
-- null as "not fillable" rather than guessing. `past_race` holds the races the
-- athlete has finished, one row each; the experience level is derived from the
-- count. Nothing here changes data.
CREATE TABLE "past_race" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"distance" text NOT NULL,
	"date" date NOT NULL,
	"finish_seconds" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "past_race_distance_known" CHECK (distance IN ('Sprint', 'Olympic', 'Half', 'Full')),
	CONSTRAINT "past_race_finish_positive" CHECK ("past_race"."finish_seconds" IS NULL OR "past_race"."finish_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "athlete" ADD COLUMN "hours_per_week" integer;--> statement-breakpoint
ALTER TABLE "past_race" ADD CONSTRAINT "past_race_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "past_race_athlete_date" ON "past_race" USING btree ("athlete_id","date");