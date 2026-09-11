-- training-architecture/04 — the app's first model of the athlete's body.
--
-- ADR 0011: the record is SPLIT BY WHO READS IT, and these three tables are that
-- split made structural rather than promised.
--
--   injury      — what it PREVENTS, per discipline. The only half a Coach prompt
--                 ever sees. Note what is NOT here: no body location, no
--                 diagnosis, no severity. "Left knee" does not imply running is
--                 out; that leap is a clinical inference and sits on the OUT side
--                 of the posture ruling. There is no column for anyone to put it
--                 in.
--   illness     — systemic, so NO per-discipline capacity at all. A separate
--                 table rather than a flag on `injury`, because these are two
--                 concepts and not one with a severity dial. One table would
--                 mean a nullable capacity meaning "all of it" for half the
--                 rows, and the first reader to forget that plans an ill athlete
--                 a swim.
--   health_note — the DETAIL THREAD. Free text, written by the athlete AND the
--                 Head Coach, and it NEVER ENTERS A PROMPT, EVER. Body location,
--                 what a physio said, how it is going. Nothing on the prompt path
--                 reads this table, and `features/health/capacity.ts` — which
--                 produces the prompt-facing sentence — has no field for it in
--                 its input type. `detail-thread-never-prompts.test.ts` is the
--                 guard on both halves of that.
--
-- NEITHER HAS A SCHEDULED END. `closed_at` is nullable and stays null until the
-- athlete says it is over; there is deliberately no `expected_end` for anyone to
-- fill in. An injury cannot be planned to finish — the plan reacts to it, it does
-- not plan around it.
--
-- Nothing here touches `sessions`. Declaring an injury skips, parks or clears
-- nothing, so nothing has to be restored on recovery and the unattempted
-- sessions resolve the ordinary way at the next Weekly Session.

CREATE TABLE "health_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"injury_id" uuid,
	"illness_id" uuid,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "health_note_one_subject" CHECK (("health_note"."injury_id" IS NULL) <> ("health_note"."illness_id" IS NULL)),
	CONSTRAINT "health_note_author_known" CHECK (author_role IN ('athlete', 'head_coach'))
);
--> statement-breakpoint
CREATE TABLE "illness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "injury" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"swim" text DEFAULT 'full' NOT NULL,
	"bike" text DEFAULT 'full' NOT NULL,
	"run" text DEFAULT 'full' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	CONSTRAINT "injury_allowances_known" CHECK (swim IN ('none', 'easy', 'full') AND bike IN ('none', 'easy', 'full') AND run IN ('none', 'easy', 'full'))
);
--> statement-breakpoint
ALTER TABLE "health_note" ADD CONSTRAINT "health_note_injury_id_injury_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injury"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_note" ADD CONSTRAINT "health_note_illness_id_illness_id_fk" FOREIGN KEY ("illness_id") REFERENCES "public"."illness"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "illness" ADD CONSTRAINT "illness_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury" ADD CONSTRAINT "injury_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_note_injury" ON "health_note" USING btree ("injury_id");--> statement-breakpoint
CREATE INDEX "health_note_illness" ON "health_note" USING btree ("illness_id");--> statement-breakpoint
CREATE INDEX "illness_athlete_open" ON "illness" USING btree ("athlete_id","closed_at");--> statement-breakpoint
CREATE INDEX "injury_athlete_open" ON "injury" USING btree ("athlete_id","closed_at");