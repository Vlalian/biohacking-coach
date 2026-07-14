Status: ready-for-agent

# PRD — Coaching Channel

> Scope note: this feature is **Coached Mode**, which ships **V1, not MVP** — it needs server-side shared state the throwaway POC doesn't have. This PRD targets the real V1 feature. It is **design-approved but gated on the round-3 Head Coach interview** (`.scratch/mvp/domain-expert-questions.md` §12). The deliverable this round is this PRD **plus a throwaway `/prototype`** of the interaction feel — **no POC build**. Reopens ADR-0003; see its 2026-07-13 amendment.

## Problem Statement

An athlete who has a Head Coach lives in two disconnected worlds. The app holds the plan, the sessions, the check-ins, and the AI Coach that has read every data point. Their actual conversation with their human coach happens somewhere else — WhatsApp, SMS, in person. So when the athlete asks about Thursday's brick, or a trend they noticed, or a piece of gear, the question happens *away* from the thing it's about: the coach answers without the plan in front of them, and the AI Coach — the one intelligence that has seen all the data — can't take part. The athlete's own words for it: *"alt skal samles ét sted"* — everything should be gathered in one place.

## Solution

A **Coaching Channel**: one persistent, three-party conversation — the athlete, their Head Coach, and the AI Coach — that lives inside the app, tied to the [Coaching Link](../../CONTEXT.md). Messages are **context-bound**: any message can carry a **Reference** to the domain object it's about (a Session, a chart or data view, an Equipment item), so the context travels with the message instead of being retyped. The AI Coach is a **guard-railed participant** — it can be asked questions and can proactively offer recommendations, but it only *suggests* (the Head Coach decides), and it never surfaces anything the Head Coach isn't already permitted to see.

It is surfaced two ways:
- a **Messaging Drawer** — a right-side, non-modal panel that rides alongside whatever the athlete is looking at and follows them around the app until they close it;
- a **Messaging View** — a full main View reached from the Navigation Drawer, the cold-start entry point and the place to read full history.

The athlete's private [Coach Chat](../../CONTEXT.md) is untouched and kept sharply distinct — the Channel is the *shared* room, Coach Chat stays the *private, unguarded* one.

## User Stories

1. As an athlete, I want one place inside the app to message my Head Coach, so I'm not juggling the app and a separate texting thread.
2. As an athlete, I want to start a message about a specific Session straight from its Session Drawer, so my coach sees exactly what I'm asking about.
3. As an athlete, I want to attach a Reference to a Session, a chart, or an Equipment item to a message, so the thing I'm talking about is *attached*, not merely described in words.
4. As an athlete, when I open the chat from a Session Drawer, I want it to appear **alongside** that drawer so both stay visible, and I want to keep interacting with both.
5. As an athlete, I want the Messaging Drawer to close **only** when I press its close button — not when I tap elsewhere — so a live conversation is never dismissed by accident.
6. As an athlete, I want the Messaging Drawer to follow me as I move between Views while a conversation is live, so I don't lose the thread when I navigate away.
7. As an athlete, I want the chat to show a short title drawn from what I referenced ("Chat about Session X, Day Y"), so I always know what this thread is anchored to.
8. As an athlete, I want a **Messaging** entry in the Navigation Drawer, so I can open my coach conversation from cold, without needing a Reference to start from.
9. As an athlete, when I open the full Messaging View, I want the docked drawer to step aside, so I'm not looking at the same conversation twice.
10. As an athlete, when I leave the Messaging View with a live conversation, I want the drawer to reappear, so the chat keeps following me.
11. As an athlete, I want the AI Coach in the room to answer questions I put to it directly, so I can get the analyst's read with my coach present.
12. As an athlete, I want the AI Coach to offer a relevant recommendation when it matters, so I benefit from both my coach's judgment and the intelligence that's read all my data.
13. As an athlete, I want my private Coach Chat to stay a separate space, so I still have an unguarded place to think out loud with the AI.
14. As an athlete, I want it to be unmistakable whether I'm in the shared Channel or my private Coach Chat, so I never share something by accident.
15. As an athlete, I want to trust that the AI will not surface things I told it privately or fields I kept unshared, so I stay in control of what my coach sees.
16. As an athlete, I want to see clearly who said each message — me, my coach, or the AI — so a recommendation is never mistaken for my coach's instruction.
17. As a Head Coach, I want to read and reply to an athlete's messages with their calendar and data right there, so I answer in context instead of blind.
18. As a Head Coach, I want to see the Reference a message is anchored to, so I know precisely which session or data the athlete means.
19. As a Head Coach, I want to control how proactive the AI is in my channel, so it stays a useful analyst rather than a backseat driver.
20. As a Head Coach, I want the AI's plan recommendations to be suggestions I act on — never changes it applies itself — so I remain editor-in-chief of the plan.
21. As a Head Coach, I want the AI to stay out of a live back-and-forth between me and the athlete, so it doesn't talk over a human exchange.
22. As an athlete without a Head Coach, I want the app to be exactly as it is today, so nothing about the solo experience changes.

## Implementation Decisions

- **New pure `channel` rules module** — mirrors `rules.js`, the single highest seam, server-independent. Holds three pure functions:
  - *Visibility filter* — given athlete data, the athlete's Link Visibility settings, and a candidate AI reference, returns what the AI may surface in the shared room. Never returns private Coach Chat content or explicitly-unshared fields.
  - *Proactivity gate* — given channel context (recent turns, triggers) and the Head-Coach proactivity setting, returns whether the AI volunteers and what it says; yields to a live human exchange.
  - *Reference resolution* — given a `{type, id}` Reference (session / chart / equipment / …), returns `{title, targetSurface}` for rendering and deep-linking.
- **Data model** — one Coaching Channel per Coaching Link. A message carries an author (`athlete` | `headCoach` | `aiCoach`), a body, an optional Reference `{type, id}`, and a timestamp. The Channel is the **first shared, server-side store** in the product (per ADR-0003) — distinct from the on-device stores the POC uses today.
- **Surfaces** — the **Messaging Drawer** is right-side, non-modal, closes only on its explicit close button, and persists across Views until closed; opened from a Reference it stacks alongside that Reference's surface (beside the Session Drawer when open). The **Messaging View** is a new Navigation Drawer destination (added to the canonical View list). Opening the View hides the Drawer; leaving it with a live conversation restores the Drawer.
- **Reference entry points** — the Session Drawer's existing **"Discuss with Coach"** action re-points from `discussWithCoach()` (AI-only Coach Chat) to opening the Messaging Drawer with that Session as a Reference. Equivalent "discuss / reference" entry points hang off charts/data views and Equipment items.
- **AI participation** — addressable, plus narrow proactive triggers; governed by a Head-Coach-controlled proactivity dial (default conservative). Plan authority unchanged: it *suggests*, the Head Coach *decides*, it never applies a session change from the Channel (ADR-0003). It speaks only within Link Visibility (decision: draws freely on coach-visible data — training, check-ins, shared profile — never private Coach Chat or unshared fields).
- **Coach Chat** — unchanged and kept distinct: a separate, private athlete↔AI surface. The Channel is shared by definition, so it is *not* a per-section Link Visibility toggle (both parties are present) — unlike Coach Chat transcripts, which stay off by default.
- **Attribution** — three visually distinct author treatments (athlete; Head Coach by real name; AI Coach), so who-said-what is always legible and an AI suggestion is never read as the coach's instruction.
- **Channel layout: one threaded stream (prototype verdict, 2026-07-14)** — all three voices interleave chronologically in a single message stream; the AI Coach's contributions (summaries, predictions, recommendations) are ordinary attributed messages *in* the conversation, carrying an "analyst" marker and an inline "suggest to plan" action. Chosen over two prototyped alternatives — AI-as-margin-notes with a pinned context card, and AI-in-a-separate-collapsible-rail — because the open three-way conversation is itself the trust story: the athlete sees both intelligences working together in one exchange. References render as chips inside the message that carries them.
- **AI turn context (prompt seam)** — the Channel history plus the active Reference assemble into the AI Coach's Session Context for its turns, the same way the Weekly Session request is built today.

## Testing Decisions

- **Test external behavior, not implementation.** Assert what a caller observes (what the AI may surface, whether it volunteers, what a Reference resolves to, which surface is visible), never internal structure.
- **Primary — `channel` rules module (pure).** Highest-value, highest-risk, fully unit-testable without a server:
  - Visibility filter *never* returns private Coach Chat content or unshared fields, across Link Visibility configurations — the leak-prevention rule (story 15) is the single most important assertion.
  - Proactivity gate honours the Head-Coach dial and trigger set, and stays silent mid human exchange.
  - Reference resolution maps `{type, id}` to the right title and target surface for each Reference type.
  - Prior art: `rules.test.mjs` (pure rules), `store.test.mjs` (entity accessors).
- **Secondary — prompt seam.** Channel history + active Reference assemble into the correct AI Session Context. Prior art: `server.prompts.test.mjs`.
- **UI feel — not unit-tested this round.** The Messaging Drawer / Messaging View surface-state (hide-when-View-open, reappear-on-leave, stack-with-Session-Drawer, close-only-on-button) is validated in the **throwaway prototype**, where it can be seen and felt — consistent with "no POC build this round."
- **Nothing is built or tested this round.** The above documents the *intended* V1 seams and their prior art, to be implemented when Coached Mode's shared-state work lands.

## Out of Scope

- **Any POC build this round.** Deliverable is this PRD + a throwaway prototype. The POC is not migrated to React and does not gain messaging.
- **Coached Mode's broader server-side shared-state infrastructure** — assumed as the V1 substrate; its design is a separate effort, not specified here.
- **Real-time presence, typing indicators, read receipts, push notifications** — deferred to V1+ delivery detail; not part of the core design.
- **A Head-Coach Roster-side inbox / cross-athlete triage** — the "coach-workflow-first" framing was explicitly *not* chosen; this PRD is athlete-first, single-channel.
- **Any change to Coach Chat** — it stays exactly as it is, private and separate.
- **The exact AI proactivity triggers, tone, and dial default** — pending the round-3 Head Coach interview (§12); the *shape* is fixed (narrow, attributed, deferring, dial-controlled), the specifics are not.
- **Overriding Link Visibility** — the "AI may surface private data" option was considered and rejected (decision 9 = keep the private boundary).

## Further Notes

- **Gated on Head Coach validation.** The round-3 interview (`.scratch/mvp/domain-expert-questions.md` §12) must confirm two things before V1 build: that the Head Coach *wants* in-app athlete conversation at all, and the AI proactivity triggers / tone / dial default. Design-approved ≠ green-lit to build.
- **Provenance.** Nine design decisions from a `grill-with-docs` session (2026-07-13). Vocabulary landed in `CONTEXT.md` the same day: **Coaching Channel**, **Messaging View**, **Messaging Drawer**, **Reference** (all flagged ⚠ pending Head Coach validation). ADR-0003 amended the same day to reopen in-app messaging.
- **Pairing.** A throwaway `/prototype` accompanied this PRD (2026-07-14): three structurally different drawer layouts (threaded / context-pinned dossier / human-stream + AI rail), flipped live against a mock Training Plan + Session Drawer. Verdict: **threaded** — the three-way conversation inspires trust. The shared drawer behaviour (right-side, non-modal, stacks left of the Session Drawer, close-button-only, follows across Views, hides while the Messaging View is open) was exercised and confirmed as designed. Prototype deleted after the verdict, per prototype discipline.
- **Athlete-first, unchanged.** Solo athletes (no Coaching Link) see none of this; the core product is untouched, consistent with ADR-0003.
