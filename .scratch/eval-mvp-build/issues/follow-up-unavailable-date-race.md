Status: ready-for-agent
Label: wayfinder:task

# Follow-up — mark/clear of the same Unavailable Date can interleave

## Parent

`.scratch/eval-mvp-build/issues/14-unavailable-dates.md`

## Where this came from

CodeRabbit on [PR #19](https://github.com/Vlalian/biohacking-coach/pull/19) (slice 14), rated Major. Filed rather than fixed at merge time — see "Why it was not fixed there".

## The defect

Both `markUnavailableDate` and `clearUnavailableDate` in
`src/features/availability/unavailable-date.ts` read the day's sessions, compute
an id list from a pure predicate, then write. The read and the write are two
round-trips, so a concurrent opposite operation can land between them:

1. `mark` reads the day, finds one parkable session, computes `parkIds`.
2. `clear` runs to completion — restores that session to `planned`, deletes the date row.
3. `mark`'s batch lands: the date row is re-inserted, but its `parkIds` now names
   a session that is already unparked, and the update re-parks it — or, if the
   read found nothing parkable, the date row is inserted with nothing parked.

The end state is an Unavailable Date whose day still holds planned, unparked
sessions — a day the Coach will plan around while the calendar shows training on it.

Reachable by one athlete toggling mark and clear on the same date near-simultaneously
(double-click, two tabs), not by two athletes — the operations are athlete-scoped.

## Why it was not fixed at merge time

The obvious fix is to delete the read entirely and let the `UPDATE`'s own `WHERE`
select the rows, making each operation a single atomic statement:

- mark: `... WHERE athlete_id = ? AND date = ? AND is_training AND status = 'planned'`
- clear: `... WHERE athlete_id = ? AND date = ? AND parked = true`

That is genuinely correct and not much code — but it moves the selection rule out of
`sessionsToPark`/`sessionsToRestore` (pure, tested, in `displacement.ts`) and into SQL
predicates that no unit test covers. That trade — losing a tested pure core to gain
atomicity — is an architecture call on the slice's own seam, not something to decide
unilaterally while merging someone else's branch.

Note `db.batch` cannot fix this: it wraps the writes, but the read happens before it,
and neon-http has no interactive transactions to widen it.

## What to build

Pick one and say why:

- **Fold the predicate into SQL** (above), and move the pure functions' tests onto the
  repository call so the rule stays covered — e.g. assert the generated `WHERE`, or test
  against a real database.
- **Serialize per (athlete, date)** — an advisory lock or a conditional write that fails
  the stale mark, so the losing operation is refused rather than silently wrong.

## Acceptance criteria

- [ ] A mark interleaved with a clear on the same date cannot leave an Unavailable Date whose day holds `planned`, unparked sessions
- [ ] The selection rule (train-only + planned for mark; parked-only and not-past for clear) is still covered by a test after the change
- [ ] Idempotence is preserved: marking an already-unavailable day is still a no-op
- [ ] The past-date guard on clear still holds — a day that has passed stays parked (ADR 0002)
