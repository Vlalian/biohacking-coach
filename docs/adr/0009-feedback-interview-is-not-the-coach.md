# The Feedback Interview is conducted by an AI that is deliberately not the Coach

Status: accepted (2026-08-19; scope and name settled 2026-08-21) — unbuilt

## Context

Unattended testers are the point of the showable version, and they are by definition the people you
cannot ask afterwards. The escape hatch specified in [showable-version/05](../../.scratch/showable-version/issues/05-feedback-loops.md)
item 4 was *"a small link that opens a short free-text form"* — honestly described in its own ticket as
something that *"does not need to be clever; it needs to exist."*

What a box returns is **"the Coach felt off sometimes."** That sentence cannot be acted on, and the
ticket opens by saying so. A box cannot ask *when*, *which session*, *which message*, or *what you did
instead. An interview can, and it is the only feedback mechanism in the product that gets **better**
the more the tester has to say — the opposite of every form.

The machinery already exists: `coach-chat-service.ts` is a working turn-taking loop over `callCoach`
with persistence, ownership checks and an empty-reply guard. A second conversation on those rails is a
prompt and a service, not a feature.

Mads's original phrasing — *"use the coach chat as a grill session"* — had two readings that were not
close in consequence, and choosing between them is what this ADR records.

## Decision

**The Feedback Interview is its own conversation, run by an AI that introduces itself as not the
Coach.** The rejected reading was the cheaper one: let the Coach conduct it inside the existing Coach
Chat thread — no new conversation kind, no new surface, arguably no new prompt.

Three reasons, two of them verified against the code rather than argued from taste.

1. **Peer Authority is a defending posture, and an interviewer must not defend.** `CONTEXT.md`
   specifies that the Coach *"holds its position unless given real reason to change it… does not
   defer, does not apologise for its conclusions."* That is deliberate and it is right for coaching.
   It is exactly wrong for whoever collects a complaint. A tester who types *"the plan you gave me was
   stupid"* would get a Coach that argues back — correctly, in character — instead of an interviewer
   that asks *"which session, and what happened when you tried it?"* The posture a grill needs is the
   one the Coach is specified not to have.

2. **The Coach is the subject under test.** Asking the thing being evaluated to run its own exit
   interview biases the answer in a direction that cannot be measured, and puts the tester in an
   awkward social position the product should not create.

3. **Feedback typed into Coach Chat becomes coaching input, permanently.** Verified, not assumed:
   `coach-chat-service.ts` resumes one resting `coach_chat` conversation per athlete and resends the
   **entire transcript** to the model on every later turn. So *"I hated the long runs and this app
   annoyed me on Tuesday"* is not a note filed somewhere — it sits in the Coach's context for the rest
   of the test, read as something the athlete said about their training. The cheap reading would have
   introduced that defect rather than found it.

**A fifth conversation kind, `feedback`.** The kind set was deliberately narrowed six → four in
[code-health/02](../../.scratch/code-health/issues/02-narrow-conversation-kinds.md), and this does not
reverse that narrowing — both kinds removed there were dead, and a Feedback Interview is **not a
coaching behaviour**, which is precisely the argument for giving it its own kind rather than hiding it
inside `coach_chat`.

**It holds no tools and no authority.** No training advice, no defence of the Coach, no plan change.
Asked a coaching question, it points at the Coach thread. It introduces itself honestly as the
builders' questions asked by an AI so it can follow up — not a new persona and not a named character.

**The Trust Signal is asked here, once, near the end.** *"Would you have done something different if
you'd decided alone?"* `CONTEXT.md` calls it the single most valuable qualitative data point, and it
is a question that badly wants a follow-up: asked by a form it returns a yes or a no; asked here it
returns the reason.

**A plain textarea ships inside the same surface** (Mads, 2026-08-21). The interview depends on a
working `callCoach`, and **a tester whose Coach is broken is exactly the tester with the most to
say.** The escape hatch therefore never hard-depends on the API — if the interview cannot start, or a
turn fails, the textarea is still there and still submits. Fallback submissions land in the same store,
tagged, so it is obvious afterwards which came from a tester the Coach could not answer. That tag is a
signal in itself, not just a degraded path. The Trust Signal is not asked from the fallback — a yes/no
is the answer `CONTEXT.md` says is worth least.

## Why this is an ADR and not just a ticket

It looks like a reversal of [ADR 0007](0007-always-on-coach-layer.md), which collapsed six
talk-to-the-Coach surfaces into one conversation. It is the opposite: 0007's divide was **privacy**
(the private thread vs the shared Coaching Channel), and this adds the only other divide the product
accepts — **the thing under test cannot be the thing collecting the verdict.** Recording it here means
the next person who tries to unify conversation kinds generically meets the reasoning instead of
rediscovering it by wiring feedback into the Coach's context.

## Consequences

- **`feedback` transcripts must never reach `buildChatPrompt` or `renderWeeklyPrompt`, proven by a
  test rather than by inspection.** This is reason 3 made structural. It should fail loudly if someone
  later wires the kinds together generically — that is the whole point.
- Mechanically small: one union member, one CHECK constraint, one migration.
- **It does not replace the thumbs** ([05](../../.scratch/showable-version/issues/05-feedback-loops.md)
  item 3), which matter more rather than less. Thumbs are cheap and in-the-moment, pinned to
  `messages.id` at the second the tester felt it; the interview is considered and after the fact, which
  is a different and worse kind of memory. A tester who thumbs-downs three messages and never opens the
  interview has still said something precise. Thumbs say *where*, the interview says *why*.
- **Item 4's free-text form is superseded, not deferred** — one build, with the box inside it. The
  escape-hatch link keeps its placement in `shell-chrome.tsx` and its "reachable from every View"
  requirement; only what it opens changes.
- **Consent:** an interview gathers substantially more free text than a form, and its value comes from
  a developer reading it. Decision 8 (2026-08-18) — testers are told in the invite email — still
  covers it, but the email copy must describe a conversation rather than a form. Whether to add a
  `disclosure.ts` purpose remains a deliberate open yes-or-no.
- Nothing here is visible to a Head Coach, and no score is ever shown to the athlete. Traceable to the
  athlete's opaque id and to nothing identifying (ADR 0006).
- **The on-screen name is settled: Feedback Interview.** A `CONTEXT.md` glossary entry. Do not drift to
  "feedback session", "exit interview", "feedback chat", or "survey".

## Build state

**Unbuilt.** Step 14 of [`.scratch/showable-version/MAP.md`](../../.scratch/showable-version/MAP.md),
ticket [showable-version/07](../../.scratch/showable-version/issues/07-feedback-interview.md),
`ready-for-agent` with every open question decided. It is on the must-land-before-an-invite list:
instrumentation added halfway through a test gives a broken baseline.

One reconciliation is owed before either half is built — [05](../../.scratch/showable-version/issues/05-feedback-loops.md)
has a live plan that predates this decision and commits item 4 to a form. Its `athlete_feedback` table,
its `shell-chrome.tsx` placement and its opaque-id storage all survive; what changes is what the link
opens. Whoever builds either should reconcile the two tickets first rather than building both halves of
the same escape hatch.

## Amendment 2026-09-30 — The conversational interview is reversed; a plain comment field replaces it

Mads, on the PR #114 preview ([showable-version/58](../../.scratch/showable-version/issues/58-one-way-to-give-feedback-grounded-in-the-app.md)):
*"using the coach as an interviewer is too big a cost for this, because we are not using AI to its
potential in this aspect. Therefore I think we should go with the comment field instead, which is
simple and easy to understand. We will add a good description of how much to include as well."* The
preview run that settled it (S117): asked for a progress line, the interviewer neither said a similar
feature was planned nor asked what it should include, which was the one job the product brief had
been added to do.

**What is reversed.** The escape hatch no longer opens an AI conversation. The feedback page is one
plain comment field, with guidance above it on what to write: what happened, where in the app (which
screen, session or message), what you expected instead, and that a couple of sentences is plenty.
This is the "short free-text form" this ADR superseded, with the guidance as the answer to the
Context's complaint that a box returns *"the Coach felt off sometimes."* The interview's prompt, its
service and its model call are deleted, not left dormant. Plan H's product brief, whose only reader
was the interviewer, never reached main: it went with PR #114, closed unmerged.

**The Trust Signal is not asked anywhere** (Mads, 2026-09-30). It stays uncollected until it gets a
surface of its own.

**What survives.**
- The escape-hatch link, its place in the drawer footer and the `from` View it carries.
- No model call and no consent gate on the path, for the reason this ADR gave the textarea: a tester
  whose Coach is broken is the tester with the most to say.
- The storage, unchanged, with no migration. A submission is an `athlete_feedback` row of kind
  `fallback`, the name from when the box sat beside the interview; `coachFailureReason` is null on
  every new row because there is no interviewer to fail. The `feedback` conversation kind and the
  `trust_signal` row kind stay in their CHECK constraints so the interviews and answers already stored
  stay readable by `npm run feedback`.
- Reason 3 still holds for those stored transcripts: `feedback-isolation.test.ts` still proves a
  `feedback` conversation cannot be resumed into Coach Chat.
- The thumbs, unchanged. They still say *where*; the comment field now says *why*.

The reasoning above — that the Coach must not collect the verdict on itself — is not what changed. No
AI collects it now.
