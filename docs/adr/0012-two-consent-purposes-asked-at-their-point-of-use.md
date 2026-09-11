# Injury data and Head Coach visibility each get a consent purpose, asked when they first matter

Two purposes join the consent set: **`injury_health_data`**, covering an injury or illness the athlete states outright, and **`head_coach_visibility`**, covering a second human reading their data. Neither is required, and neither is asked at onboarding — the first is asked the first time an athlete declares an Injury or Illness, the second when a Coaching Link is accepted. `DISCLOSURE_VERSION` moves to `2026-09-10`, invalidating every prior grant, deliberately and now.

## Why

Two gaps, both pre-dating this effort, which `training-architecture/04` and `/06` made urgent by putting explicit health information in front of a second person.

**`health_data` does not stretch to an injury description.** What the athlete actually agrees to is an enumerated list of *training signals* — "sleep, energy, how a session felt, resting pulse" — hedged as signals that *can reveal* health information by inference. "Left Achilles, sharp on push-off, physio says tendinopathy" is health information stated outright. That is a materially larger claim, and [ADR 0011](0011-an-injury-is-split-by-who-reads-it.md)'s split does not close it: keeping the detail thread out of prompts narrows what crosses to Anthropic and OpenAI, but says nothing about what the app *stores*, which is the Article 9 question.

**Nothing covered being seen by a Head Coach at all.** ADR 0003's own 2026-08-11 amendment already listed this as an unmet pre-launch item — the consent system that shipped covers AI processing (`ai_coaching`, `health_data`, `product_improvement`) and no human reader. Slice 04 has the Head Coach writing into an injury's detail thread, which lands on both gaps at once.

**Separate purposes rather than wider wording**, because consent has to stay unbundled. An athlete must be able to use the Coach and still decline to write injury notes; folding the two into one tick would make it a condition of use rather than freely given. That is the same reasoning that already keeps `product_improvement` out of `REQUIRED_CONSENT_PURPOSES`.

**Asked at their point of use rather than at onboarding**, for two different reasons. Most athletes never have a Head Coach, so asking everyone up front about something that may never happen adds noise to the one screen that most needs to be read — and at link acceptance the question is concrete, with a named person attached to it. The injury purpose is the same shape: asked by someone who is, at that moment, actually about to record an injury.

**The version bump is timed, not incidental.** Bumping `DISCLOSURE_VERSION` invalidates every prior grant and forces re-consent. Today the only grant that exists is Mads's own, so it costs nothing; once testers exist it becomes a wall of legal text in front of an invited person's first impression. The choice was between paying that now for free or later at full price.

## Consequences

- ~~Slices 04 and 06 are **cleared to reach a second real person** once this lands.~~ **Not yet, and this sentence was wrong when written** (corrected by the 2026-09-10 review). The two purposes exist and are declarable, but **nothing asks for either one**: the declaration and link-acceptance surfaces they are asked at do not exist, so no athlete can grant them and no code gates on them. The *decision* ADR 0011 was waiting on is made; the *clearing* waits on those surfaces. Slices 04 and 06 must not reach a second real person until then.
- The `consent.purpose` check constraint is **rendered from `CONSENT_PURPOSES`** rather than retyped in `db/schema.ts`. It used to be a hand-written list beside a docstring asking the reader to keep the two in step — this change is exactly the one that would have broken that promise, so the promise was replaced with a single list.
- Two purposes now have no consent screen of their own to be granted from. The gates that ask for them live at the declaration and link-acceptance surfaces, and until those surfaces exist the purposes are declarable but unasked.
- The disclosure text remains **the product's honest description of processing, not lawyer-drafted final text**. The legal/privacy review the `gdpr-decisions` document calls for is still owed, and whether any of this warrants advice beyond the team is still open — the one part of `training-architecture/12` Mads did not settle.
