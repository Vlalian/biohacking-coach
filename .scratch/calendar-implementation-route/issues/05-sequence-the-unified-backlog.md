Label: wayfinder:grilling
Status: done
Assignee: Mads Kilstrup
Blocked by: 01, 02, 03, 04
Created: 2026-07-09
Resolved: 2026-07-12

# 05 — Sequence the unified backlog

## Question

With the rulings in — Multi-Session-Day issue fates ([Map Multiple Sessions Per Day onto the entity store](02-map-multi-session-day-onto-the-entity-store.md)), the migration design ([Decide the one-shot migration](03-decide-the-one-shot-migration.md)), the Coach-facing identity ([Decide the Coach-facing session identity](04-decide-coach-facing-session-identity.md)), and the domain expert's round-2 answers ([Get domain expert round-2 answers](01-get-domain-expert-round-2-answers.md)) — produce the final route:

- **Apply the rulings to the tracker**: rewrite, absorb, or close-supersede the Multi-Session-Day issues; fold migration and identity decisions into the affected Draggable Calendar issue bodies; adjust rules copy/defaults (Rest dominance, Doubles, Athlete Sessions) per the expert answers.
- **Order the surviving issues** into one implementation sequence (the Draggable Calendar PRD's layering — store, then rules, then orchestrator, then UI — is the presumed spine; decide where the Weekly-plan-extraction work slots in).
- **Settle the test-plan reconciliation** from the map's fog (Multi-Session-Day seams vs the rule matrix), or spin it into its own ticket if it resists settling here.
- **Flip statuses** so the frontier is visible: the first implementable issue(s) `ready-for-agent`, anything superseded closed with a pointer.

Output: the ordered route recorded here and reflected in the feature trackers — nothing left to decide before implementation sessions start picking up issues. This ticket reaching `done` should mean the map's destination is reached.

## Resolution

Resolved with Mads, 2026-07-12 (three ballots under the map's briefing format, then the rulings applied to the trackers).

**Three decisions made here:**

1. **Cross-Week Move + Move Checkpoint deleted.** [Cross-Week Move + Move Checkpoint](../../draggable-calendar/issues/06-cross-week-move-checkpoint.md) is closed — retired before build, per the expert's round-2 answer (never moved a session to another week; the week is the planning unit; catch-up belongs in the Weekly Session). Session Moves are within-week only; drops toward another week bounce; `needsCheckpoint` and the cross-week counter are gone from the rules module; [The Coach sees the moves](../../draggable-calendar/issues/08-coach-sees-the-moves.md) simplifies to background-context-only. Cross-Week Move, Move Checkpoint, and the checkpoint's Pushback Rationale capture are retired in CONTEXT.md. Revisit only if the human coach disagrees at V1 (interview guide §12).
2. **Retro-log opens to every past day.** "+" creates a completed Athlete Session (with immediate rating) on any past day — no deadline on recording reality. Past weeks stay frozen for moving/editing existing sessions; retro-log creation is the one action that reaches them. Applied to [Athlete Sessions + retro-log](../../draggable-calendar/issues/07-athlete-sessions-retro-log.md) and CONTEXT.md.
3. **The store issue carries the `agreeWeeklyPlan` redirect; the Weekly-plan issue slots at position 2.** [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md) redirects the write path (single-session semantics) so no window exists where agreed plans miss the store; the rewritten [Weekly plan lands in the session store](../../multi-session-day/issues/04-weekly-session-multi-session-prompt.md) adds multi-session extraction, `dayOrder` from array order, the Planning-phase instruction, and natural-reference `skippedSessions`.

**The final route (all rulings applied to the issue bodies):**

1. [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md) — store + migration design + report + write-path redirect + `dayOrder` + multi-session `SESSION_DEFAULTS` (frontier: `ready-for-agent`, unblocked)
2. [Weekly plan lands in the session store](../../multi-session-day/issues/04-weekly-session-multi-session-prompt.md) — rewritten onto entities
3. [Expanded Week, read-only](../../draggable-calendar/issues/02-expanded-week-read-only.md) — + reconciled dot spec (5 dots, `+N`, per-session styling, complete = all rated)
4. [Session Drawer replaces inline expansion](../../draggable-calendar/issues/03-session-drawer.md) — + per-session feedback header, banner button by `dayOrder`
5. [Within-week Session Move](../../draggable-calendar/issues/04-within-week-session-move.md) — narrowed: other-week drops bounce; no checkpoint machinery
6. [Rest dominance (Displacement)](../../draggable-calendar/issues/05-rest-dominance-displacement.md) — + non-moralising copy ruling
7. [Athlete Sessions + retro-log](../../draggable-calendar/issues/07-athlete-sessions-retro-log.md) — retro-log any past day; Strength "for those who want extra" copy
8. [The Coach sees the moves](../../draggable-calendar/issues/08-coach-sees-the-moves.md) — simplified; now blocked by 04 + 07

Closed-superseded with pointers: Multiple Sessions Per Day issues [01](../../multi-session-day/issues/01-data-model-session-array.md), [02](../../multi-session-day/issues/02-calendar-multi-dot-expansion.md), [03](../../multi-session-day/issues/03-per-session-feedback-skip.md) and Draggable Calendar [06](../../draggable-calendar/issues/06-cross-week-move-checkpoint.md). Both PRDs carry a route-amendment note; CONTEXT.md glossary updated (terms retired, Displacement/Athlete Session/Session Move entries re-ruled).

**Test-plan reconciliation (the map's fog, settled):** the Multi-Session-Day seams fold into the route — Seam 1 (compound-key storage) is dead with the old data model; Seam 2 (multi-dot rendering) lives in Expanded Week's DOM tests; Seam 3 (extraction with duplicate `dayOfWeek`) is the Weekly-plan issue's acceptance test. The Draggable Calendar's table-driven rule matrix stays the correctness spec, minus its cross-week rows. No separate ticket needed.

The map's destination is reached: one foundation, every issue rewritten/absorbed/closed, one migration, one ordered backlog with [Sessions become entities](../../draggable-calendar/issues/01-sessions-become-entities.md) as the open frontier.
