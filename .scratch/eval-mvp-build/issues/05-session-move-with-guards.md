Status: done (2026-07-18) — Move rules ported as a pure TS module with the matrix; server-authoritative move (actor from auth session, ownership checked, rules re-run against server today); events table (migration 0003); update+event atomic via db.batch; narration benched (narrated_at null). Browser-verified a real drag persisted + recorded the event; 34 tests. resolveDrop/Displacement scoped out (not in this slice's criteria). PR pending.
Label: wayfinder:task

# 05 — Session Move, with the rules enforced server-side

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The athlete moves a session to another day within its week, and the move is allowed, bounced, or refused according to the Move rules — decided on the server, not the client.

**This slice ports real code.** `poc/public/js/rules.js` is pure, storage-free, DOM-free, and its table-driven tests in `poc/test/rules.test.mjs` *are* the rule matrix. Port both to TypeScript with the matrix intact: `frozen` (completed sessions and everything in past weeks — the training record is immutable), `bounce` (past days, the session's own day, any day outside its own Mon–Sun week — the Cross-Week Move is retired), `move` (a silent within-week Session Move). See [ADR 0002](../../../docs/adr/0002-calendar-authority-model.md).

The rules module stays pure. The server calls it; the client asks the server. A client-side check may drive affordances (what looks draggable), but it is never the authority — [ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md) puts truth on the server.

Brings the `events` table. A successful move records a `session_moved` event with its actor. This is the audit half of ticket 05's ballot 3 — the unified event stream that Week Activity and Pattern Insight later read. Narration is **benched** for the eval (ticket 02, amended): record the event with attribution, leave `narrated_at` null, announce nothing.

## Acceptance criteria

- [ ] The Move rules are ported to TypeScript as a pure module, with the table-driven test matrix carried across and passing
- [ ] The athlete can move a planned session to another day in its own week
- [ ] A completed session cannot be moved; a session in a past week cannot be moved
- [ ] Moves to a past day, to the session's own day, or outside its own week bounce — nothing changes
- [ ] The server is the authority: a request that violates the rules is refused regardless of what the client sent
- [ ] The acting athlete is derived from the authenticated server session, never from the request body; the server verifies the athlete owns the target session before applying any move
- [ ] A move against another athlete's session is refused, even when the request is otherwise legal under the Move rules
- [ ] The `events` table exists via migration; a successful move records a `session_moved` event with actor and payload, `narrated_at` null. The actor is the authenticated athlete, not a client-supplied one
- [ ] The session update and its `session_moved` event are written in one transaction: both land, or neither does
- [ ] Nothing is announced to the athlete about the event
- [ ] Tests cover the rule matrix, the server refusing a client-forged illegal move, and the cross-athlete move refusal

## Blocked by

`.scratch/eval-mvp-build/issues/04-calendar-renders-real-sessions.md`
