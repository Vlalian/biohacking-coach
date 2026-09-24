-- garmin-integration/03: the source identity of an uploaded activity, so a
-- history import (and a later API sync) never lands the same activity twice.
-- `external_id` is `garmin:<start time>`, null for everything the app wrote
-- and for an activity with no start time. Unique per athlete only where it is
-- set. Additive: two nullable columns and an index; nothing here changes data.
ALTER TABLE "detected_activities" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_athlete_external_id_idx" ON "sessions" USING btree ("athlete_id","external_id") WHERE "sessions"."external_id" is not null;