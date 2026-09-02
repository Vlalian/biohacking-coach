CREATE TABLE "detected_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"sport" text,
	"duration" integer,
	"note" text,
	"start_time" timestamp,
	"summary" jsonb,
	"samples" jsonb NOT NULL,
	"matched_session_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detected_activities" ADD CONSTRAINT "detected_activities_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_activities" ADD CONSTRAINT "detected_activities_matched_session_id_sessions_id_fk" FOREIGN KEY ("matched_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detected_activities_athlete_date_idx" ON "detected_activities" USING btree ("athlete_id","date");