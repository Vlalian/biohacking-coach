CREATE TABLE "athlete_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"view" text,
	"conversation_id" uuid,
	"coach_failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_feedback_kind_valid" CHECK ("athlete_feedback"."kind" IN ('fallback', 'trust_signal'))
);
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_kind_valid";--> statement-breakpoint
ALTER TABLE "athlete_feedback" ADD CONSTRAINT "athlete_feedback_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_feedback" ADD CONSTRAINT "athlete_feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_feedback_athlete_idx" ON "athlete_feedback" USING btree ("athlete_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_feedback_trust_signal_once" ON "athlete_feedback" USING btree ("athlete_id") WHERE "athlete_feedback"."kind" = 'trust_signal';--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_valid" CHECK ("conversations"."kind" IN ('weekly_session', 'coach_chat', 'onboarding', 'coach_briefing', 'feedback'));