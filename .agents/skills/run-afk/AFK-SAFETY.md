# AFK Safety Rubric

How to decide whether a `ready-for-agent` issue can actually be built with nobody there.

## The bias

Wrongly queueing costs a night. Wrongly deferring costs one task, and Mads sees it on the needs-you list the moment he's back with the reason attached.

Those costs aren't symmetric. **When in doubt, defer.**

## Why `ready-for-agent` isn't enough

`ready-for-agent` means *"fully specified"* — triage's judgment that the issue is clear. It doesn't mean *"needs no human"*, and triage was not asked that question. A perfectly specified task can still be gated on a signup, a decision, or an expert answer.

So the label tells you the spec is good. It tells you nothing about whether an agent can finish alone. That's this rubric's job.

## The four gates

### 1. Label

| Label | AFK-safe? | Why |
|---|---|---|
| `wayfinder:task` | Yes, if the other gates pass | Buildable work with acceptance criteria |
| `wayfinder:grilling` | **Never** | A grilling session is a conversation with Mads. There is no grilling without him |
| `wayfinder:research` | Rarely | Reading and synthesis can run alone, but these usually exist to *inform a decision Mads makes*. Queue only if the deliverable is a document, not a decision |
| `wayfinder:map` | No | Route-mapping is planning, which is deciding |
| *(none)* | No | Unlabeled work hasn't been through triage's classification |

### 2. Blockers

Read `## Blocked by`. A blocker counts as cleared only when its Status token is `done`.

**Follow the chain transitively.** A task whose blocker is itself blocked is blocked. This matters more than it sounds: an effort's backlog is often one long chain rooted in a single first slice, so one corked root corks all of it. Resolve the whole graph before concluding anything is runnable.

If a blocker link is broken or points at a missing file, that's needs-you, not a pass.

### 3. Human gates

The thing that makes a task un-AFK-able is rarely labeled as such. Read the issue — body, notes, and comments — and ask: *is there a step here only Mads can perform?*

Look for:

- **Accounts and signups** — creating a service account, choosing a plan, verifying an email
- **Credentials** — API keys, tokens, secrets not already in the environment
- **Money** — anything with a billing consequence
- **Open decisions** — "decide X", "confirm Y", "pick between A and B". A decision is Mads's, and a note that a prior ticket "flagged one check" means the check is still open
- **Expert input** — a question routed to the domain expert or coach
- **Real-world acts** — uploading a file from his device, reviewing something on a screen, a physical measurement

Conventionally these appear as `HITL:` in `## Notes`, and that marker is a reliable positive signal. But its **absence proves nothing** — read for the gate, don't grep for the marker.

### 4. Testability

`/tdd` needs a behavior list. Derive it from the acceptance criteria before queueing. If you can't — criteria are vague, gestural, or absent — the agent will invent one and build confidently in the wrong direction, and you won't find out until morning.

No criteria, no queue.

## Worked example: 01-walking-skeleton

*A snapshot from 2026-07-16, kept because it shows the reasoning. The board has moved on since. Re-read the issue; don't trust this verdict.*

`.scratch/eval-mvp-build/issues/01-walking-skeleton.md`

- **Status:** `ready-for-agent` ✅
- **Label:** `wayfinder:task` ✅
- **Blocked by:** "None — can start immediately." ✅
- **Acceptance criteria:** eight concrete, testable items ✅

Three gates pass and the criteria are excellent. A filter reading only Status and blockers queues this immediately.

Then the notes:

> **HITL:** this slice needs a Neon signup. Route ticket 04 verified Frankfurt and the DPA, and flagged one signup-time check: confirm the free plan actually offers the Frankfurt region.

An agent cannot sign up for Neon. Without the database there's no connection, no migration, no seeded row — the criteria are unreachable. And the flagged check is an open question with a real consequence: if the free plan has no Frankfurt region, the stack decision itself needs revisiting. That's not a task, that's a decision.

**Verdict: needs you.** Reason: *"Needs a Neon signup, plus confirmation that the free plan offers the Frankfurt region."*

This is the case the whole rubric exists for. Everything cheap to check said go.

## Worked example: the corked chain

*Also a 2026-07-16 snapshot. The shape is the lesson, not the verdict.*

At the time, the `eval-mvp-build` backlog was one dependency chain: 02 blocked on 01; 04 on 02; 05, 06, 07, 08 on 04; and so on to 14.

01 was HITL-blocked. So all fourteen were transitively blocked, and the correct queue was **empty**.

The right response is not to find something else to do. It's:

> Nothing is AFK-safe right now. All 14 eval-mvp-build slices chain back to 01-walking-skeleton, which needs a Neon signup from you. That one signup unblocks the entire backlog.

That report is worth more than a night of marginal work. It names the cork.
