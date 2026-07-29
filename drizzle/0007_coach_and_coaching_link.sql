CREATE TABLE "coach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"information_view_layout" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "coaching_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"share_athlete_reports" boolean DEFAULT true NOT NULL,
	"share_ai_transcripts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"severed_at" timestamp,
	CONSTRAINT "coaching_link_status_valid" CHECK ("coaching_link"."status" IN ('active', 'severed'))
);
--> statement-breakpoint
ALTER TABLE "coach" ADD CONSTRAINT "coach_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_link" ADD CONSTRAINT "coaching_link_coach_id_coach_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_link" ADD CONSTRAINT "coaching_link_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_link_active_pair_idx" ON "coaching_link" USING btree ("coach_id","athlete_id") WHERE "coaching_link"."status" = 'active';--> statement-breakpoint
CREATE INDEX "coaching_link_coach_idx" ON "coaching_link" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coaching_link_athlete_idx" ON "coaching_link" USING btree ("athlete_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_coach_id_coach_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach"("id") ON DELETE no action ON UPDATE no action;