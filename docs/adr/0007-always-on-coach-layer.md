# The Coach is an always-on layer over the athlete's existing stack, not a ritual-based replacement

Status: accepted (2026-08-03) · amended 2026-08-25

## Context

The Target Athlete's stated resistance is *"this is just another training app."* The product had been built to answer that with *more coaching functionality* — a rich set of new rituals (Weekly Session as the "primary interaction loop", Session Reflection, Session Negotiation, Reflective Prompt, Monthly Review) delivered across six separate "talk to the Coach" surfaces. That design asks the athlete to *adopt a new system that sits next to* the Garmin/TrainingPeaks stack they already live in — the exact shape of the resistance. It also under-uses the AI's one structural advantage over a human coach: infinite availability. Modeling the AI on a periodic human coach (scheduled rituals) wastes that.

## Decision

Reposition the Coach from a ritual-based replacement to an **always-on layer on top of the athlete's existing stack**. Three moves:

1. **Sync is the spine (design), objective data flows in.** The app owns the *subjective* layer (Body/Mind feedback, Pattern Insight); the *objective* session record flows from where the athlete already is via **Detected Activity**. Detection *proposes, never asserts*: the athlete's rating is the gesture that commits a session to the immutable record; absence of an activity is never a skip. Transport in MVP is **manual `.fit`/`.gpx` upload** (already built). Live sync is a later transport-only upgrade: **Strava is permanently ruled out** (its API agreement bans AI use and forbids showing a user's data to anyone but that user — fatal to both the LLM and Coached Mode); direct Garmin's program is enterprise-only and on hold; the credible route is a health-data aggregator (Terra/Spike) pending written vendor confirmation. See `.scratch/garmin-sync/sync-alternatives-research.md`. **Correction (2026-08-03):** an earlier draft of this ADR named Strava as the first sync source; that was wrong — prior project research had already ruled it out, and follow-up research confirmed it more strongly.
2. **One conversation, not six surfaces.** The Coach becomes the **Coach Overlay** — a movable, context-aware panel available on every View, hosting a single private athlete↔Coach thread. Coach Chat, the Weekly Session, Session Negotiation, and the Reflective Prompt become *behaviors inside that one thread*, not destinations. The only surviving divide is privacy: the private thread vs the Head-Coach-shared Coaching Channel (Coached Mode, V1). Default View becomes the Training Plan; Coach is no longer a View.
3. **The Weekly Session is offered, not forced.** Next week's plan is generated automatically and adapts continuously from passive signals, so the differentiator keeps working even for an athlete who never talks. The Coach proactively opens the planning conversation once a week (the single sanctioned nudge); the athlete enters it or dismisses it.

## Why

An athlete adopts a new system that *replaces* something painful, not one that *duplicates* tools they already use. Making the Coach a layer — objective data pulled from their watch, one always-available conversation, planning that happens whether or not they show up — removes the learning curve and the duplication while keeping the differentiator (subjective adaptation, Coaching Presence). "Always available" stays pull-based, so the calm no-nag stance survives.

## Consequences

- Reverses the "Weekly Session is the primary interaction loop" framing throughout `CONTEXT.md`; a consistency pass is owed across downstream references (Navigation Drawer, Coaching Closing Move, First Weekly Session Closing, Week 1 BOOM, Messaging View, Presence Arc).
- Adds a dependency on a third-party sync source (Strava/aggregator) and its terms; the manual "Mark complete" button survives only as the fallback for sessions sync can't see (pool swims, strength, mobility).
- Coach Engagement Rate becomes a *truer* signal (chosen engagement, not marched-through compliance) but the product must now actively drive discoverability of the optional conversation rather than relying on a mandatory gate.
- Supersedes the interaction-model portions of the earlier ritual-centric design; does not change the authority model (ADR 0002/0003) or the server-authoritative architecture (ADR 0006).

## Amendment 2026-08-25 — Coached Mode is MVP, not V1; and the overlay gained the ability to act

Two corrections, neither of which touches this ADR's decision.

**The "(Coached Mode, V1)" label in decision 2 is stale.** [ADR 0003's 2026-08-11 amendment](0003-coached-mode-authority.md) moved Coached Mode from V1 to **MVP** — the V1 deferral rested on Coached Mode being a privacy exception, and ADR 0006 made the whole app server-authoritative, so the exception stopped existing. Read decision 2 as: the surviving divide is the private thread vs the Head-Coach-shared **Coaching Channel**, which ships in MVP. The Channel itself remains **designed but unbuilt** — the private half of the overlay is what exists today.

**"One conversation, not six surfaces" now has two deliberate exceptions, and both prove the rule rather than break it.**

- **Coach Actions** ([ADR 0008](0008-coach-actions-and-the-durability-rule.md), 2026-08-13) let the Coach operate app surfaces from inside the one thread, which is what makes collapsing the six surfaces pay off — talking replaces navigating instead of merely replacing five other chat boxes.
- **The Feedback Interview** (decided 2026-08-19; `CONTEXT.md`, [showable-version/07](../../.scratch/showable-version/issues/07-feedback-interview.md)) is a *separate* conversation kind, run by an AI that is explicitly **not** the Coach, and it is the one surface deliberately kept out of the single thread. Three reasons, all specific to this ADR's logic: Peer Authority is a posture that holds its position and does not apologise for its conclusions, which is exactly wrong for taking a complaint; the Coach is the subject under test, so it cannot run its own exit interview; and the thread resends its whole transcript every turn, so feedback typed into it becomes permanent coaching context. Unbuilt as of this amendment.

**Unchanged:** the always-on layer, detection proposing rather than asserting, and the Weekly Session being offered rather than forced.
