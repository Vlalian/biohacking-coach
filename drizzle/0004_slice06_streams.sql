CREATE TABLE "session_streams" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"samples" jsonb NOT NULL,
	"sample_interval_s" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_streams" ADD CONSTRAINT "session_streams_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;