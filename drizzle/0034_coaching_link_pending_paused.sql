ALTER TABLE "coaching_link" DROP CONSTRAINT "coaching_link_status_valid";--> statement-breakpoint
DROP INDEX "coaching_link_active_pair_idx";--> statement-breakpoint
ALTER TABLE "coaching_link" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_link_active_pair_idx" ON "coaching_link" USING btree ("coach_id","athlete_id") WHERE "coaching_link"."status" IN ('pending', 'active', 'paused');--> statement-breakpoint
ALTER TABLE "coaching_link" ADD CONSTRAINT "coaching_link_status_valid" CHECK ("coaching_link"."status" IN ('pending', 'active', 'paused', 'severed'));--> statement-breakpoint
-- training-architecture/14 (Mads, 2026-10-31): a real athlete's link waits for
-- their Head-Coach-visibility consent, which no one could give before this
-- release. So every active link of a real athlete without a live grant goes
-- back to pending, and the athlete is asked on their next visit. Synthetic
-- persona athletes (no user, a synthetic_label) have no one to ask: their
-- links stay active.
UPDATE "coaching_link" SET "status" = 'pending'
WHERE "status" = 'active'
  AND "athlete_id" IN (SELECT "id" FROM "athlete" WHERE "synthetic_label" IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "consent"
    WHERE "consent"."athlete_id" = "coaching_link"."athlete_id"
      AND "consent"."purpose" = 'head_coach_visibility'
      AND "consent"."withdrawn_at" IS NULL
  );
