CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"parked" boolean DEFAULT false NOT NULL,
	"is_training" boolean DEFAULT true NOT NULL,
	"duration" integer,
	"zone" text,
	"note" text,
	"title" text,
	"day_order" integer DEFAULT 0 NOT NULL,
	"start_time" timestamp,
	"sport" text,
	"summary" jsonb,
	"feedback_body" integer,
	"feedback_mind" integer,
	"feedback_comment" text,
	"rated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_origin_valid" CHECK ("sessions"."origin" IN ('coach', 'athlete', 'garmin', 'head_coach')),
	CONSTRAINT "sessions_status_valid" CHECK ("sessions"."status" IN ('planned', 'completed', 'skipped')),
	CONSTRAINT "sessions_feedback_body_range" CHECK ("sessions"."feedback_body" IS NULL OR "sessions"."feedback_body" BETWEEN 1 AND 5),
	CONSTRAINT "sessions_feedback_mind_range" CHECK ("sessions"."feedback_mind" IS NULL OR "sessions"."feedback_mind" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_athlete_date_idx" ON "sessions" USING btree ("athlete_id","date");