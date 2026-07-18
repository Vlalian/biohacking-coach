-- Slice 02: login with better-auth.
--
-- Brings better-auth's tables (user, session, account, verification) and
-- reshapes `athlete` to the identity model ruled in route tickets 06 and 07:
-- the name moves behind the user seam, columns take their glossary names, and
-- user_id becomes text to reference better-auth's text user id.

-- better-auth's tables. Created first so athlete's user_id can reference user.
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint

-- Slice 01 seeded one placeholder athlete (display_name 'Mads', no user). It
-- predates this identity model — 'Mads' was never a synthetic label — so it is
-- dropped here rather than renamed into one. The seed repopulates through the
-- real flow: Mads as a user, plus a fabricated synthetic athlete.
DELETE FROM "athlete";--> statement-breakpoint

-- Glossary names (route 07) and the name-behind-the-seam rename (route 06).
ALTER TABLE "athlete" RENAME COLUMN "display_name" TO "synthetic_label";--> statement-breakpoint
ALTER TABLE "athlete" RENAME COLUMN "phase" TO "training_phase";--> statement-breakpoint
ALTER TABLE "athlete" RENAME COLUMN "comm_style" TO "communication_style";--> statement-breakpoint
ALTER TABLE "athlete" RENAME COLUMN "weekly_session_count" TO "training_sessions_per_week";--> statement-breakpoint
ALTER TABLE "athlete" RENAME COLUMN "info_layout" TO "information_view_layout";--> statement-breakpoint

-- synthetic_label is null for real athletes; user_id is text to match user.id.
ALTER TABLE "athlete" ALTER COLUMN "synthetic_label" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete" ALTER COLUMN "user_id" SET DATA TYPE text USING "user_id"::text;--> statement-breakpoint

ALTER TABLE "athlete" ADD CONSTRAINT "athlete_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_identity_source" CHECK (("athlete"."user_id" IS NULL) <> ("athlete"."synthetic_label" IS NULL));--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
