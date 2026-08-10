CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"disclosure_version" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp,
	CONSTRAINT "consent_purpose_valid" CHECK ("consent"."purpose" IN ('ai_coaching', 'health_data', 'product_improvement'))
);
--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_athlete_idx" ON "consent" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_active_purpose_idx" ON "consent" USING btree ("athlete_id","purpose") WHERE "consent"."withdrawn_at" IS NULL;