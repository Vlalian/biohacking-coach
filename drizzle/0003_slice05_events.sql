CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"narrated_at" timestamp,
	CONSTRAINT "events_actor_type_valid" CHECK ("events"."actor_type" IN ('athlete', 'head_coach', 'coach_ai', 'system'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_athlete_idx" ON "events" USING btree ("athlete_id","created_at");