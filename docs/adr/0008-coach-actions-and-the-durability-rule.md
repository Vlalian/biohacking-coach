# The Coach may operate the app on the athlete's behalf, and asks permission only for what persists

Status: accepted (2026-08-13) — largely unbuilt; see the note at the foot

The Coach Overlay is always available and knows what the athlete is looking at, so the natural next
step is letting talking replace navigating: "compare my last three long rides" opens the Comparison,
"I got new tyres" adds the Equipment. These are **Coach Actions** — the Coach operating an app surface
for the athlete, always at their request, never unbidden.

**Decision (Mads, 2026-08-13).** Permission is decided by **durability**, not by read-versus-write and
not by risk. An action whose result vanishes on its own — opening a Comparison, surfacing a Panel,
navigating a View — the Coach simply performs; the result is on screen and dismissing it is the undo.
An action whose result persists until someone removes it — adding Equipment, changing a session,
planning a week — is never performed directly: it is staged as an **Action Proposal** the athlete
confirms with a tap.

The rejected alternative was confirming everything, which reads safer and is not: a confirm gesture on
a harmless popup costs two taps to save two, so the lazy-athlete value disappears, and it trains the
athlete to tap yes without reading — which is how the confirm that *does* matter stops working.
Consent fatigue is the failure mode this ADR is designed against.

## What holds this together

- **Only a tap commits; a typed "yes" never does.** In an open conversation athletes agree in words,
  and reading those words as permission hands the decision back to the model — where every ambiguous
  "yeah, ok" resolves toward acting. The gesture must be one the model has no part in.
- **A Coach Action carries selection, never content** — ids the server re-resolves against the
  signed-in athlete, or filter criteria the client resolves against real data. The same discipline a
  Reference already follows ("a claim, not a fact"). A model-supplied chart in the Information View
  would be indistinguishable from a measured one, on the one surface where the athlete is entitled to
  assume they are looking at reality (ADR 0004).
- **The action set is closed**, not a free-form instruction the client obeys. The Coach may only reach
  functions that already exist. Athlete free text flows into this model; a door where model output
  becomes an executed instruction is worth closing before it exists.
- **Authority still tracks authorship.** An Action Proposal against a Head-Coach-authored Prescribed
  Session is refused server-side — the AI explains and holds (ADR 0003). Session authorship therefore
  has to reach the prompt, or the Coach will offer changes it is forbidden to make.
- **One session at a time.** A whole Week Plan is never a Coach Action; asked for in the overlay, the
  Coach hands off to the Weekly Session (one tap, same surface, ADR 0007). Exactly one code path ever
  writes a week.

## Consequences

- Extends ADR 0003's "the Coach proposes, the athlete decides" from plan-writing to **every**
  Coach-initiated app action, and applies to solo athletes too — which is why this is a new ADR rather
  than an amendment to a Coached Mode one.
- `CONTEXT.md`'s Session Negotiation entry previously argued from "the Coach cannot change the plan
  from that thread (no proposal tool there)". Coach Actions make that false; the entry is corrected in
  place, with the old claim quoted rather than quietly removed. The collapse of Session Negotiation
  into the baseline conversation stands on its own — the Reference was always the right shape and
  never depended on the Coach being unable to write.
- The closed action set caps the Coach to what the app can already draw. An athlete asking for
  something the Panel Catalog has no panel for gets an honest "I can't see that from here — want me to
  open your Information View?", which fits Declared Uncertainty better than a confident guess. Whether
  the Coach should ever compose a novel view is an open question for the first real Head Coach, not a
  decision taken here.
- Data retrieval is deliberately **not** part of this. Coach Actions move ids, criteria, and view
  state — never records chosen by the model. A `find_sessions` tool was considered and deferred: it is
  the only capability that would put unreviewed athlete data into a prompt, and criteria-based
  selection covers the realistic cases without that exposure. Revisit when a concrete question arrives
  that criteria cannot express; structured filters first, never free text over athlete comments.

## Build state, 2026-08-25

Recorded because this ADR reads as describing the product and mostly describes an intention. Checked
against `src/`, not against the tracker.

**What exists.** One Action Proposal: the Weekly Session's whole-week plan proposal with confirm and
cancel ([`src/features/coach/plan-proposal.ts`](../../src/features/coach/plan-proposal.ts)), which
predates this ADR and is the pattern it generalises from. Coach Chat can see the Week Plan
(`coach-actions/01`, PR #36), which is the read half of the context this ADR assumes.

**What does not.** The closed action set, the view-tier actions (opening a Panel, a Comparison, a
View), and single-session changes from the thread are all unbuilt —
[`coach-actions/02–06`](../../.scratch/coach-actions/PRD.md), deliberately deferred by
[`.scratch/showable-version/MAP.md`](../../.scratch/showable-version/MAP.md). Adjusting the plan by
talking is covered for now by the Weekly Session's whole-week proposal.

**One consequence of that is worth naming.** The durability rule's cheap half — the actions the Coach
performs *without* asking — is the half that does not exist yet. So today every Coach-initiated change
goes through a confirm, which is the *rejected* alternative in this ADR, arrived at by having built
nothing rather than by deciding. That is harmless while there is one action: consent fatigue is a
function of how many confirms an athlete meets, and the count is one. It stops being harmless the
moment the view-tier actions land, so the order they land in is a real choice — view-tier first
restores the rule, single-session-change first deepens the exception.
