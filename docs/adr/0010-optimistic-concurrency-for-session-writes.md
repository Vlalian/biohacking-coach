# Two people write one session, so the second writer is refused, not applied

Status: accepted (2026-08-25)

ADR 0003 gave the Head Coach authority to edit and delete sessions on a linked athlete's plan, and
ADR 0002 kept placement with the athlete. Both write the same rows. Until now neither path guarded
against the other: `head-coach-service.ts` and `session-move.ts` each read the session, checked
authority, and then wrote unconditionally. Two writes racing meant the second silently overwrote the
first — no error, no record, no way for either person to find out. The athlete's move and the Head
Coach's edit are exactly the pair most likely to collide, because both happen on Monday morning
against the same week.

**Decision (2026-08-25).** `sessions` carries a `version` column. Every write to a contested column
sends the version it read, the version travels into the `WHERE` clause, and a row that has moved on
since simply does not match — the write is refused and the writer is told what beat them. The version
is bumped in the same statement that applies the change, so the next stale writer is caught in turn.

This is the same move the codebase already makes for ownership. `athlete-session.ts` puts the
ownership check in the `WHERE` rather than trusting the read above it, and its `dayOrder` is computed
inside the `INSERT` for the same reason: **a guard left behind in the read guards nothing.** The
version is that principle applied to time instead of identity.

The rejected alternative was serialising writes through a queue, which is how the Clapet system design
solves it (`.scratch/clapet-system-design/`). A queue delivers the same guarantee but has to tell the
loser asynchronously, which in that design costs three more components — a rejection handler, a Redis
broker, and a subscription service — to deliver news that a refused write can carry back in the
request the writer is already waiting on. A queue is largely how a distributed system *recovers* the
serialisation it gave up by distributing; this app has one Postgres and has given up nothing.

## What is and is not versioned

- **Versioned:** content (`type`, `duration`, `zone`, `title`, `note`) and placement (`date`). These
  are the columns both actors write — the Head Coach's edit sets all of them, a Session Move sets the
  date.
- **Not versioned:** status toggles (complete / skip / unavailable) and Session Reflections. They are
  the athlete's alone and touch columns nobody else writes, so versioning them would manufacture
  conflicts that cannot occur. A completed-status write and a coach's content edit are orthogonal and
  both should land.

## What holds this together

- **The version must come from what the writer saw, never from a fresh read.** Re-reading it inside
  the service would make the check pass by construction and restore last-write-wins while looking
  like it had been fixed. `editPrescribedSession` therefore takes `expectedVersion` as a required
  parameter rather than resolving it itself.
- **A refused write leaves no trace in the event log.** The compare-and-set runs first and the event
  is written only if it won, so the audit trail never records a change that did not happen.
- **The refusal says what changed, not just that something did.** `conflict.ts` reports the base
  version, the winning row, and the fields that actually diverge — the "original, conflicting, and
  their attempted version" the design asks for. A writer who cannot see what beat them cannot decide
  whether to retry.

## Consequences

- `Session` and the coach's `PlanSession` both carry `version`. Nothing renders it; every editor
  sends it back. The shape guard in `session-repository.test.ts` pins this.
- Atomicity is imperfect and deliberately so. The `neon-http` driver has no interactive transactions,
  and `db.batch()` runs its statements unconditionally — which would log an event for a write that
  lost. So the compare-and-set and the event insert are two statements: if the second fails, a real
  change goes unlogged. That is a worse audit trail, never a wrong session row. Closing it means a
  data-modifying CTE and hand-written SQL at each call site; revisit if the event log becomes
  load-bearing.

  **That condition has since been met — 2026-09-02, four days later.**
  `undoDetectedImport` (`showable-version/14`, PR #47) reads the event log as *the authority* on
  whether a completion came from a Garmin import: the newest `garmin_imported` /
  `garmin_import_undone` for a session decides whether undo is offered at all. So "a worse audit
  trail, never a wrong session row" is no longer the whole consequence — a lost `garmin_imported`
  makes a real import **un-undoable**, leaving the athlete a completed session with device data they
  cannot walk back, which is the permanence that ticket exists to remove.

  Note also that the driver is `neon-http`, where every statement is its own HTTP request, so the gap
  between the two writes is a network round-trip rather than an in-process microsecond.

  The decision below is unchanged and this ADR is **not** superseded: the trade was correct when made
  and is still correct at test-round scale. What changed is the cost of losing, and that is now
  scheduled work rather than a contingency — `.scratch/post-testing/MAP.md` entry 8, with the
  trip-wire that jumps it if a tester reports an import they cannot undo.
- The athlete-facing message for a lost Session Move is a calendar bounce (`bounceConflict`), reusing
  the existing bounce banner rather than inventing a second refusal surface.
- Soft-delete tombstones are **not** part of this. A delete is compare-and-set like any other write,
  and a subsequent edit finds no row and returns the existing `not-found`. Tombstones arrive with the
  erasure path, which needs them anyway.
- This closes FR-5 of the Clapet system design. FR-4 (Head Coach pre-approval of the generated week)
  was decided in the same session and is **not** built — it reverses this ADR's assumption that the
  Head Coach edits a live plan, and gets its own ADR when it lands.
