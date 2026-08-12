# The Coach is an always-on layer over the athlete's existing stack, not a ritual-based replacement

Status: accepted (2026-08-03)

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
