Status: done (2026-08-03) — merged via PR #20. Coach roster + server-enforced Link Visibility. Folded in the richer designs: first-class CoachingLink type, coach roster-wide layout persistence, and getSharedTranscripts (share_ai_transcripts made real).
Label: wayfinder:task

# 11 — The Head Coach logs in and sees the Roster

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The recruited coach signs in, sees their Roster, opens a linked athlete, and reaches that athlete's Information View — gated by Link Visibility, enforced on the server.

This is the slice the whole eval exists for: the moment a second real person sees the athlete's data from another machine.

Brings `coach` and `coaching_link`. Per the [signed-off schema](../../coach-eval-mvp-route/issues/05-server-data-model.md): a coach row points at a better-auth user and holds ONE `info_layout` across the whole roster (ADR 0004). A `coaching_link` carries `status` (active|severed), `share_athlete_reports` (default true), and `share_ai_transcripts` (default false), with a unique active pair. **There is no calendar flag by construction** — the calendar is always visible per [ADR 0003](../../../docs/adr/0003-coached-mode-authority.md). Do not add one.

Head Coach names a **relationship, not a kind of person** (CONTEXT.md): someone is a Head Coach only of the athletes their Coaching Links point at, and the same person can hold a coach row and an athlete row at once without conflict. Build for that; it costs one row and it is the shape a real roster grows into.

Link Visibility is **enforced server-side**, not hidden client-side. If `share_ai_transcripts` is false, the transcripts must not reach the browser at all — not be fetched and then not rendered.

**What each flag governs** (Mads, 2026-07-17 — ticket 05 amended in place; the old name `share_training_data` made this slice read as self-contradictory, since a session on the calendar plainly *is* training data). Two booleans collapse CONTEXT.md's six Link Visibility sections. The mapping is the contract, and it is field-level, not gestural:

| Section | Flag | Coach sees it when the flag is false? |
|---|---|---|
| Calendar, sessions (date, type, duration, zone, title, note), statuses, move log | **none — always on** | **Yes.** Non-toggleable. "A Head Coach who can't see the plan isn't a coach; sever the link instead" |
| Session Reflections (Body/Mind RPE, comments, `rated_at`) | `share_athlete_reports` | No |
| Check-in data | `share_athlete_reports` | No |
| Athlete Profile training fields and stats (`training_phase`, `experience_level`, `race_target`, `training_sessions_per_week`, `profile`, `equipment`) | `share_athlete_reports` | No |
| Coach Chat and Weekly Session transcripts | `share_ai_transcripts` | No |

So `share_athlete_reports` false is **not** an empty Roster: the coach still sees the calendar, the sessions with their parameters, and the Information View panels built from them. What goes is what the athlete *reported about their own body*. That asymmetry is the doctor-patient model, not an oversight.

Per ADR 0004, an unshared section renders **no panels** — "gone, not empty".

CONTEXT lists a sixth section, "Coach briefings (on)", that neither flag covers. Known gap, not this slice's to close — leave it.

The Roster is MVP-trimmed (ticket 02): shallow synthetic athletes give contrast, Mads is the only full profile. The invite flow is deferred — the seed script creates the Coaching Link directly, and a later invite flow will create the same row.

**Where each name comes from** ([route 06](../../coach-eval-mvp-route/issues/06-display-name-vs-identity-separation.md), 2026-07-17). This is the slice where the two cases meet in one list, so state it rather than let it be inferred:

- **The `coach` table carries no name column.** `coach.display_name` was dropped — `coach.user_id` is non-null, so the name lives in better-auth's `user.name` and is read through the join. Do not reintroduce it.
- **A real athlete's name** (Mads) comes from `user.name` via `athlete.user_id`.
- **A synthetic athlete's label** comes from `athlete.synthetic_label`, which is null for anyone with a login. Synthetic athletes have no user row — that null *is* the discriminator, not a missing value to code around.

So the Roster renders `user.name ?? synthetic_label`, and every name it shows that belongs to a real person came out of the auth tables. That is what keeps ADR 0006's "a leak of the training data alone names no one" true.

## Acceptance criteria

- [ ] `coach` and `coaching_link` exist via migration, with the unique-active-pair constraint and no calendar flag
- [ ] `coach` carries **no** name column; the coach's name renders from `user.name` via `coach.user_id` (route 06)
- [ ] The Roster renders real athletes' names from `user.name` and synthetic athletes' from `synthetic_label`, in one list
- [ ] The seed script creates the coach user, coach row, one active Coaching Link to Mads, and the shallow synthetic athletes
- [ ] The coach signs in and sees their Roster
- [ ] The coach opens a linked athlete and reaches their Information View
- [ ] With `share_ai_transcripts` false, transcripts are never sent to the client — verified at the network layer, not the UI
- [ ] With `share_athlete_reports` false, Session Reflections, Check-in data, and Athlete Profile training fields/stats are never sent to the client — also verified at the network layer. Per ADR 0004 their Information View panels are gone, not empty
- [ ] With `share_athlete_reports` false, the calendar, the sessions and their parameters, statuses, the move log, and the panels built from them all still render — the flag withholds what the athlete reported, not the plan
- [ ] The calendar is visible regardless of flags
- [ ] A coach cannot reach an athlete they have no active link to — a forged request is refused server-side
- [ ] A severed link revokes access
- [ ] One person holding both a coach row and an athlete row works in both capacities
- [ ] Tests cover each visibility gate, the no-link refusal, the severed-link revocation, and the dual-role person operating in both capacities

## Blocked by

`.scratch/eval-mvp-build/issues/10-information-view-on-real-data.md`
