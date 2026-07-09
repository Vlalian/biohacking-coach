# Calendar Implementation Route

Label: wayfinder:map
Status: open
Created: 2026-07-09

## Destination

A single, decided implementation route across the Draggable Calendar and Multiple Sessions Per Day features: the data-model conflict resolved (entity store as the one foundation), every Multi-Session-Day issue rewritten, absorbed, or closed-superseded accordingly, one migration plan, and a final ordered backlog the implementation sessions can pick up issue by issue. Route decided, then hand off — implementation itself happens in the feature issues, outside this map.

## Notes

- **Standing decision** (Mads, 2026-07-09): the Draggable Calendar's identity-bearing **session store is the single data-model foundation** (per ADR 0002). Multiple Sessions Per Day is re-expressed on top of it; its `sessionIndex` / `"YYYY-MM-DD-{index}"` key scheme is superseded. One migration, not two.
- **No execution override**: tickets resolve decisions. Editing the feature tracker files (rewriting issues, reordering, flipping statuses) *is* recording those decisions and is in scope; writing product code is not.
- The features under routing: [Draggable Calendar PRD](../draggable-calendar/PRD.md) (issues 01–08) and [Multiple Sessions Per Day PRD](../multi-session-day/PRD.md) (issues 01–04). Known collisions: two data models, inline day expansion vs Session Drawer, duplicate multi-dot specs.
- Domain language lives in [CONTEXT.md](../../CONTEXT.md); use its terms exactly (Session Block, Session Move, Cross-Week Move, Move Checkpoint, Displacement, Double, Athlete Session, Session Drawer, Expanded Week, Weekly Session, ...). ADRs: [0002 calendar authority model](../../docs/adr/0002-calendar-authority-model.md) governs; 0003 (Coached Mode) is out of scope.
- Skills for ticket sessions: /grilling and /domain-modeling by default; /prototype if a UI question needs a concrete artifact.
- **Grilling format** (Mads, 2026-07-09): one decision at a time, and every decision gets a plain-language briefing *before* the ballot — the problem with a concrete example, each option's practical consequences, and the recommendation with its reasoning. No jargon-dense multi-question batches; use a mockup when the question is visual.
- Wayfinding operations on this local-markdown tracker:
  - The map is this file. Tickets are `issues/NN-<slug>.md` in this directory.
  - Ticket labels: `Label: wayfinder:<research|prototype|grilling|task>` line near the top.
  - **Claim** = set an `Assignee:` line on the ticket before any work. Open + unassigned = unclaimed.
  - **Blocking** = a `Blocked by: NN, NN` line in the ticket body. Unblocked when every listed ticket has `Status: done`.
  - **Frontier** = tickets with `Status: ready-for-agent` or `ready-for-human`, no assignee, and no open blockers.
  - **Resolve** = append the answer under `## Resolution`, set `Status: done`, add one line to Decisions so far below.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Map Multiple Sessions Per Day onto the entity store](issues/02-map-multi-session-day-onto-the-entity-store.md) — msd issues 01–03 close-superseded with absorption into the entities/Expanded-Week/Drawer issues (only the plan-extraction issue survives standalone); entity gains a `dayOrder` field; reconciled dot spec adopted (≤5 dots, `+N` overflow, per-session styling, day complete = all rated).
- [Decide the one-shot migration](issues/03-decide-the-one-shot-migration.md) — no compound keys exist; skip/unavailable/rating markers map to entity statuses; template-era feedback reconstructed, nothing dropped; eager horizon seeding; `bh_store_version` idempotency with old keys never touched; one-time visible migration report for both live users.
- [Decide the Coach-facing session identity](issues/04-decide-coach-facing-session-identity.md) — natural references (date + type, position only for same-type Doubles); ids never in prompts; extraction allows duplicate `dayOfWeek` with array order = `dayOrder`; plan agreement replaces the week's provisional sessions via the store.

## Not yet specified

- **Test-plan reconciliation** — Multiple Sessions Per Day's three seams vs the Draggable Calendar's table-driven rule matrix; whether the surviving seams fold into the matrix or stay separate probably falls out of the backlog sequencing, but may need its own ticket if not.
- **Edits to the Draggable Calendar issue bodies themselves** — they were written before the standing decision; whether any need touching (beyond absorbing Multi-Session-Day material) won't be visible until the rulings from tickets 02–04 land.

## Out of scope

- **Implementing the feature issues** — this map decides the route; code happens in the feature issues afterward.
- **Coached Mode / ADR 0003** (Head Coach, Prescribed Sessions, Roster View, Coach Briefing) — excluded by both PRDs.
- **The MVP relational data layer** — the entity store and migration are POC-scoped; the MVP schema is its own future effort.
- **Other tracker work** (nav-training-plan `future` issues, MVP PRD breakdown) — not part of this route.
