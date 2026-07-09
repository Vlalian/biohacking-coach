Label: wayfinder:grilling
Status: done
Assignee: claude (Mads's session, 2026-07-09)
Created: 2026-07-09
Resolved: 2026-07-09

# 02 — Map Multiple Sessions Per Day onto the entity store

## Question

Given the standing decision (the session store is the one foundation; `sessionIndex` keys are superseded), rule on the fate of each Multiple Sessions Per Day issue:

- [Data model: session array per day](../../multi-session-day/issues/01-data-model-session-array.md) — fully superseded by [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md)? Anything in it (e.g. `SESSION_DEFAULTS` extended to multi-session phase/day templates) that the entity issue doesn't carry and must be absorbed?
- [Calendar: multiple dots and multi-session day expansion](../../multi-session-day/issues/02-calendar-multi-dot-expansion.md) — the inline-expansion half collides with [Session Drawer replaces inline expansion](../../draggable-calendar/issues/03-session-drawer.md); the multi-dot half duplicates the Draggable Calendar's collapsed-week dot spec. Reconcile into ONE dot spec (up to 3 dots + `+N` overflow? per-session solid/outline/muted? day "completed" = all sessions rated?) and decide where the surviving material lives.
- [Per-session feedback and skip marking](../../multi-session-day/issues/03-per-session-feedback-skip.md) — re-express on entities: skip becomes `status: 'skipped'`, feedback becomes the embedded `feedback` field, actions live in the Session Drawer. What survives as its own issue vs is absorbed into the Drawer issue?

Output: a ruling per issue (rewrite / absorb-and-close / close-superseded), with the reconciled multi-dot spec written down. Don't renumber or flip statuses yet — that's the backlog-sequencing ticket's job.

## Resolution

Resolved with Mads, 2026-07-09 (decisions re-confirmed under the map's briefing format).

**Ruling per Multiple Sessions Per Day issue:**

- [Data model: session array per day](../../multi-session-day/issues/01-data-model-session-array.md) — **close-superseded** by [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md): multiple entities sharing a `dateKey` *is* the array; feedback links by entity id, not compound key. **Absorb into the entities issue:** (a) `SESSION_DEFAULTS` phase templates gain a small number of realistic two-session days (e.g. Endurance + Recovery on one day per phase) so materialized future weeks demonstrate Doubles; (b) `getLastWeekFeedback` reads from the store. The plain-date-key backward-compat shim is superseded by the migration (see the migration ticket).
- [Calendar: multiple dots and multi-session day expansion](../../multi-session-day/issues/02-calendar-multi-dot-expansion.md) — **close-superseded, split absorption**: the inline-expansion half dies with [Session Drawer replaces inline expansion](../../draggable-calendar/issues/03-session-drawer.md) (per-session actions live in the Drawer, opened per Session Block — no sub-panels); the multi-dot half becomes the collapsed-week dot spec, absorbed into [Expanded Week, read-only](../../draggable-calendar/issues/02-expanded-week-read-only.md).
- [Per-session feedback and skip marking](../../multi-session-day/issues/03-per-session-feedback-skip.md) — **close-superseded**: skip = `status: 'skipped'` on the entity; feedback = the embedded `feedback` field; per-session actions are Drawer actions. **Absorb into the Drawer issue:** the feedback modal header names the specific session's type; the "Rate this session" banner button targets today's first session by day order. The `skippedSessions` /api/weekly payload is re-decided in the Coach-facing identity ticket.
- [Weekly Session: multi-session days in plan extraction and prompt](../../multi-session-day/issues/04-weekly-session-multi-session-prompt.md) — **survives** as the one standalone Multi-Session-Day issue, rewritten onto entities per the Coach-facing identity ticket.

**Two decisions made in the course of the ruling:**

1. **`dayOrder` field**: the canonical entity gains an integer `dayOrder` (position within its day, minted on create/drop, appended at end of day; gaps after moves are fine). Replaces `sessionIndex`'s ordering job; identity is the entity `id`. Drag-to-reorder within a day stays out of scope.
2. **Reconciled dot spec** (Mads adjusted the cap): up to **5 dots** side by side in type colours; six or more shows 4 dots + `+N`; dot style (solid/outline/muted) is per-session by its own status; a day is "complete" only when every session on it is rated; mixed styles are normal. The Drawer/Doubles fog is settled by this plus per-block Drawer opening — no new ticket needed.

Tracker edits (closing the msd issues, moving the absorbed text) are executed by the backlog-sequencing ticket, per its Question.
