Status: ready-for-human — built and in review via [PR #21](https://github.com/Vlalian/biohacking-coach/pull/21) (stacked on [PR #20](https://github.com/Vlalian/biohacking-coach/pull/20)/slice 11). Authority as guards on `origin`, server-enforced; add/edit/delete + `head_coach` events verified against the live DB; `move-rules.ts` untouched (athlete keeps placement). DoD green; reviewed manually across both axes (the parallel /code-review agents hit the session limit).
Label: wayfinder:task

# 12 — The Head Coach prescribes and edits, and the authority holds

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The Head Coach adds, edits, and deletes sessions on a linked athlete's plan, and the three-tier authority rules hold — enforced on the server.

A **Prescribed Session** is a session with `origin: head_coach` (ticket 05). That column is the whole mechanism: every authority rule is a guard on it, in the same pattern as the existing garmin guards. The Head Coach is editor-in-chief of the plan — the Coach still drafts the Week Plan through the Weekly Session, but the Head Coach may add, edit, or delete at any time, and **Head-Coach-authored content is never silently modified by the Coach or its automation** ([ADR 0003](../../../docs/adr/0003-coached-mode-authority.md), CONTEXT.md).

Ticket 02 scoped this to **full authority rules with lean surfaces**: the rules are complete, but there is no approval-queue UI. Do not build one.

Events carry attribution: a Head Coach action records with `actor_type: head_coach`. **Narration stays benched** (ticket 05, ballot 3, amending ticket 02) — the audit half is real, the announcement half waits for the coach interview, and `narrated_at` stays null as the un-bench hook. The athlete is told nothing by this slice.

Interaction with the Move rules from slice 05: the athlete's rules constrain the athlete. The Head Coach's authority is a different tier. Where they meet — can an athlete move a Prescribed Session? — is answered by ADR 0003 and ticket 02, not by inventing a rule here. Read them; if genuinely unanswered, stop and ask rather than guessing.

## Acceptance criteria

- [ ] The Head Coach can add a session to a linked athlete's plan; it persists with `origin: head_coach`
- [ ] The Head Coach can edit and delete sessions on a linked athlete's plan
- [ ] Head-Coach-authored content is never silently modified by the Coach or its automation
- [ ] The authority rules are guards on `origin`, enforced server-side
- [ ] A Head Coach cannot act on an athlete they have no active link to
- [ ] Actions record events with `actor_type: head_coach` and the actor's ID, `narrated_at` null
- [ ] Nothing is announced to the athlete
- [ ] No approval-queue UI is built
- [ ] Tests cover each authority rule and the no-link refusal

## Blocked by

`.scratch/eval-mvp-build/issues/11-coach-logs-in-and-sees-the-roster.md`
`.scratch/eval-mvp-build/issues/05-session-move-with-guards.md`
