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
