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
ALTER TABLE "athlete" DROP COLUMN "equipment";