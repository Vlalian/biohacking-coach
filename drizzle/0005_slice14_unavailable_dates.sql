CREATE TABLE "unavailable_dates" (
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unavailable_dates_athlete_id_date_pk" PRIMARY KEY("athlete_id","date")
);
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_status_valid";--> statement-breakpoint
ALTER TABLE "unavailable_dates" ADD CONSTRAINT "unavailable_dates_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_status_valid" CHECK ("sessions"."status" IN ('planned', 'completed', 'skipped', 'unavailable'));