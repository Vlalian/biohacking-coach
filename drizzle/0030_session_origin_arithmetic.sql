-- training-architecture/34: the block arithmetic writes sessions of its own,
-- so `arithmetic` joins the closed set of origins. Widening a CHECK refuses no
-- existing row; nothing here changes data. The Coach's accepted week replaces
-- these rows the way it replaces its own drafts.
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_origin_valid";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_origin_valid" CHECK ("sessions"."origin" IN ('coach', 'athlete', 'garmin', 'head_coach', 'arithmetic'));