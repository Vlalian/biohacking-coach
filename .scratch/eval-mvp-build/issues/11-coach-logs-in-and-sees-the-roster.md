Status: ready-for-agent
Label: wayfinder:task

# 11 — The Head Coach logs in and sees the Roster

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The recruited coach signs in, sees their Roster, opens a linked athlete, and reaches that athlete's Information View — gated by Link Visibility, enforced on the server.

This is the slice the whole eval exists for: the moment a second real person sees the athlete's data from another machine.

Brings `coach` and `coaching_link`. Per the [signed-off schema](../../coach-eval-mvp-route/issues/05-server-data-model.md): a coach row points at a better-auth user and holds ONE `info_layout` across the whole roster (ADR 0004). A `coaching_link` carries `status` (active|severed), `share_training_data` (default true), and `share_ai_transcripts` (default false), with a unique active pair. **There is no calendar flag by construction** — the calendar is always visible per [ADR 0003](../../../docs/adr/0003-coached-mode-authority.md). Do not add one.

Head Coach names a **relationship, not a kind of person** (CONTEXT.md): someone is a Head Coach only of the athletes their Coaching Links point at, and the same person can hold a coach row and an athlete row at once without conflict. Build for that; it costs one row and it is the shape a real roster grows into.

Link Visibility is **enforced server-side**, not hidden client-side. If `share_ai_transcripts` is false, the transcripts must not reach the browser at all — not be fetched and then not rendered.

The Roster is MVP-trimmed (ticket 02): shallow synthetic athletes give contrast, Mads is the only full profile. The invite flow is deferred — the seed script creates the Coaching Link directly, and a later invite flow will create the same row.

## Acceptance criteria

- [ ] `coach` and `coaching_link` exist via migration, with the unique-active-pair constraint and no calendar flag
- [ ] The seed script creates the coach user, coach row, one active Coaching Link to Mads, and the shallow synthetic athletes
- [ ] The coach signs in and sees their Roster
- [ ] The coach opens a linked athlete and reaches their Information View
- [ ] With `share_ai_transcripts` false, transcripts are never sent to the client — verified at the network layer, not the UI
- [ ] With `share_training_data` false, training data is likewise withheld server-side
- [ ] The calendar is visible regardless of flags
- [ ] A coach cannot reach an athlete they have no active link to — a forged request is refused server-side
- [ ] A severed link revokes access
- [ ] One person holding both a coach row and an athlete row works in both capacities
- [ ] Tests cover each visibility gate, the no-link refusal, the severed-link revocation, and the dual-role person operating in both capacities

## Blocked by

`.scratch/eval-mvp-build/issues/10-information-view-on-real-data.md`
