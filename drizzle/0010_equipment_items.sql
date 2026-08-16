CREATE TABLE "equipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_items_category_valid" CHECK ("equipment_items"."category" IN ('bike', 'shoes', 'watch', 'other'))
);
--> statement-breakpoint
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_items_athlete_idx" ON "equipment_items" USING btree ("athlete_id","created_at");--> statement-breakpoint
-- No back-fill: the dropped column never held anything.
--
-- `athlete.equipment` existed in the schema from 0000 but nothing ever wrote
-- it. `completeOnboarding` in athlete-repository.ts excludes it by name, with
-- a comment saying so ("deliberately NOT written here... equipment has its own
-- tab in the POC"), and that tab was never built until this slice. Verified
-- against main before writing this migration rather than assumed, because a
-- DROP is not reversible: a copy from equipment -> equipment_items would move
-- zero rows.
ALTER TABLE "athlete" DROP COLUMN "equipment";