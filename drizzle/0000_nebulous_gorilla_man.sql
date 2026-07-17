CREATE TABLE "athlete" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"phase" text,
	"experience_level" text,
	"comm_style" text,
	"race_target" text,
	"weekly_session_count" integer,
	"profile" jsonb,
	"equipment" jsonb,
	"info_layout" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
