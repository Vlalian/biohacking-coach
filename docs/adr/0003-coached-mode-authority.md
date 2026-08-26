# Coached Mode adds a human authority above the AI without repositioning the product

The product's identity is the accessible alternative to a human coach, yet Coached Mode makes human coaches first-class users. We resolved this athlete-first: a Head Coach is an optional enhancement, linked per-athlete by invite code (no discovery, no marketplace, no credential verification — trust is out-of-band), never a requirement. Authority is three-tiered: the Head Coach outranks the Coach on plan content and is never silently overridden by automation (Week Rebalancing may only *suggest* changes to Prescribed Sessions); the athlete keeps placement (drag) and reality (completion records) regardless of who authored a session; Athlete Sessions remain the athlete's territory — view-only even to the Head Coach. Privacy follows the doctor-patient model: athlete-controlled Link Visibility with training data shared by default and AI-conversation transcripts opt-in — the app supplies boundaries and choice; the humans own the confidentiality.

## Consequences

- Coached Mode is the first feature requiring server-side shared athlete state — a deliberate, consent-gated exception to the on-device-only privacy architecture (Privacy Proxy, Session Context). It therefore ships in V1, not MVP; the POC may fake the coach surface with a mock roster.
- Session authorship becomes three-valued (Coach / Head Coach / athlete), and every calendar rule from ADR 0002 resolves per authorship class — see the Prescribed Session glossary entry for the matrix.
- The Coach gains two new conversational duties: narrating Head Coach actions to the athlete with attribution, and answering Head Coach interrogation via the Coach Briefing within Link Visibility bounds.
- The Concept Story is amended, not replaced: "can't afford a human coach" remains the core segment; coached athletes are an extension where the product strengthens an existing human relationship instead of substituting for one.
- Domain expert validation pending — see `.scratch/mvp/domain-expert-questions.md` section 10.

## Amendment 2026-07-13 — In-app messaging reopened as the Coaching Channel

The original consequence *"no in-app athlete↔Head Coach messaging in the first version"* is reopened. A `grill-with-docs` session (2026-07-13) settled the **Coaching Channel**: one persistent three-party conversation (athlete + Head Coach + AI Coach) on a Coaching Link, context-bound via References, surfaced through a right-side non-modal Messaging Drawer and a Messaging View. The AI participates as a guard-railed voice (narrow proactive triggers, Head-Coach-controlled dial, suggests-not-applies) and speaks only within Link Visibility — freely on coach-visible data, never surfacing private Coach Chat or unshared fields. Coach Chat stays the athlete's separate private space.

**Status:** design-approved, **pending Head Coach validation** (interview guide §12). Unchanged: athlete-first, server-side-shared-state, ships V1. This round produces a V1-targeted PRD plus a throwaway prototype of the interaction feel — no POC build (Coached Mode still needs server state).

## Amendment 2026-08-11 — Coached Mode moves to MVP; the round-3 interview stops gating build

**The original V1-deferral reasoning no longer holds.** This ADR's Consequences section gave one reason Coached Mode shipped V1: *"a deliberate, consent-gated exception to the on-device-only privacy architecture."* [ADR 0006](0006-server-authoritative-architecture.md) later made the whole app server-authoritative, not just Coached Mode — the exception the reasoning depended on stopped existing. Separately, most of Coached Mode has since been built and shipped to `main` regardless of the V1 label: Roster View, Head Coach authority, Prescribed Sessions, Link Visibility, and the Coach Briefing (eval-mvp-build slices 04, 11–13) are live. The V1/MVP label had fallen out of sync with reality before this amendment, not because of it.

**Decision (Mads, 2026-08-11):** Coached Mode is MVP scope, and it ships to real users — not just relabeled in the docs while gated behind further validation. Three things were deliberately cut to build Coached Mode fast for a single-real-athlete eval (Mads evaluating his own build); they were acceptable there and are not acceptable for a second real person:

1. **The Coaching Link is seeded, not invited** (`coach-eval-mvp-route` issue 02, ballot 6) — no athlete-invites-coach / coach-invites-athlete flow exists.
2. **No consent purpose covers being seen by a Head Coach.** The consent system that shipped (Slice 15, PRs #27/#29) covers AI processing (`ai_coaching`, `health_data`, `product_improvement`) — nothing covers a second human seeing the athlete's data via Link Visibility.
3. **Narration with attribution is benched** (ballot 5) — acceptable only because the eval's one real athlete is Mads. This ADR already calls narration non-negotiable; it must come off the bench before a third party joins, and this amendment is that trigger.

These three are the real pre-launch checklist, tracked in `.scratch/coached-mode/`. They replace the round-3 interview as the gate.

**The round-3 Head Coach interview is dropped as a pre-launch gate.** Every provisional coach-facing design this ADR and `.scratch/coached-mode/prototype-outline.md` describe — the four Coach Assistance tiers, Coaching Directive, Coaching Channel tone and AI participation scope — was written from Mads's own product intent, explicitly marked pending outside validation. That validation now happens live, against the first real Head Coach's actual use, instead of a scripted interview beforehand. This is a real trade-off, not a formality removed: the design ships unvalidated by an outside coach, and the tiers, the Directive's phrasing, and the Channel's tone may all turn out wrong in ways an interview could have caught first. Accepted knowingly in exchange for reaching a real user sooner.

**Unchanged by this amendment:** the three-tier authority model, Prescribed Session rules, Link Visibility as the privacy mechanism, and the Coaching Channel's private/shared separation. This amendment changes *when* Coached Mode ships and *how* its remaining design gets validated — not what it does.

## Amendment 2026-08-21 — The Head Coach may move sessions; placement stops being the athlete's alone

**The original decision.** This ADR's three-tier model states that *"the athlete keeps placement (drag) and reality (completion records) regardless of who authored a session"*. Placement was deliberately excluded from the Head Coach's authority: `head-coach-authority.ts` said so in a comment, CONTEXT.md summarised it as *"placement belongs to the athlete, content belongs to the author"*, and Session Move was defined as *"an athlete-initiated relocation"*. The coach's calendar was rendered read-only on purpose.

**Decision (Mads, 2026-08-21):** the Head Coach may move sessions on a linked athlete's calendar. Found the first time a Head Coach account was actually used — the smoke run of [showable-version/01](../../.scratch/showable-version/issues/01-live-smoke-run.md) — where the inability to drag read as a missing feature rather than a principle.

**What the original reasoning got right, and what it missed.** The rule protected something real: an athlete's week is shaped by a life the coach cannot see, and a coach who rearranges it from outside can produce a plan that is correct on paper and impossible in practice. That risk is unchanged. What the rule missed is that placement *is* coaching — spacing hard days, putting the long ride where recovery follows it — and a Head Coach who may author a session but not decide which day it lands on has been given a pen and no calendar. Editor-in-chief of the plan, with no say in when it happens.

**Placement becomes shared, not transferred.** The athlete keeps every placement right they had: they may move any session, including one the Head Coach just moved, and they need no permission and give no explanation (US-3). This is deliberately not a lock or a first-writer-wins race — last move stands, and disagreement about *when* is a coaching conversation, not a scheduling conflict the app should adjudicate.

**Unchanged by this amendment:**

- **Reality.** Completion records stay the athlete's, and a completed or past session stays frozen for everyone — the Move rules are re-run server-side against the server's clock for the coach exactly as for the athlete.
- **Athlete Sessions.** Still the athlete's territory, still view-only to the Head Coach — a coach may not move one. This amendment reverses the placement rule for the *plan*; it does not touch the separate rule that the athlete's own entries are theirs. That is the obvious next question if it grates in use, and it should be asked on its own rather than folded in here.
- **Content authority**, the AI's suggest-not-apply constraint, and Link Visibility.

**A consequence this ADR already names as non-negotiable.** Coached Mode requires that *"the plan never mutates silently by an invisible hand"* — Head Coach actions are narrated to the athlete with attribution. A coach silently moving an athlete's training is precisely the case the requirement exists for. The move records a `session_moved` event with `actor_type = 'head_coach'` whose payload carries `from` and `to`, so the material for narration is captured from day one.

It is not yet announced. Narration itself runs: [coached-mode/03](../../.scratch/coached-mode/issues/03-unbench-narration.md) has landed, and `narratePendingEvents` fires on every app-open from the shell layout. But `NARRATABLE_TYPES` in `narration-repository.ts` lists only `session_prescribed`, `session_edited` and `session_deleted`. A move is recorded, matched by nothing, and told to no one.

So this amendment ships a known breach of the ADR's own non-negotiable, and the remedy is small and entirely within landed code: one entry in that list, and a `moved` clause in the composer with wording in both locales. It is left undone rather than improvised because that wording is athlete-facing copy, not plumbing. **This is acceptable only while the single real athlete is Mads** — the same trigger the 2026-08-11 amendment already set for a third party joining.

*Corrected 2026-08-26: this paragraph previously said narration was benched and blamed coached-mode/03 for the silence. That was true when written on 2026-08-21 and stopped being true when coached-mode/03 merged. The silence is a missing list entry, not a missing feature — recorded rather than quietly rewritten, because an ADR that misnames a cause sends the next reader to fix the wrong thing.*
