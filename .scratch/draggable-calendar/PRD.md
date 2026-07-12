Status: ready-for-agent

# PRD — Draggable Calendar

Grounded in `CONTEXT.md` (Expanded Week, Session Block, Session Move, Displacement, Double, Athlete Session, Session Drawer) and `docs/adr/0002-calendar-authority-model.md`. Use those terms exactly.

> **Route amendments (2026-07-12, [Calendar Implementation Route](../calendar-implementation-route/MAP.md)):** Cross-Week Move + Move Checkpoint are retired — issue 06 is closed, Session Moves are within-week only, and drops toward another week bounce. Retro-logging opens to every past day. The canonical entity gains `dayOrder`; the collapsed-day dot cap is 5 (+N at six or more). Rest-dominance and Strength copy follow the round-2 expert rulings recorded in the issues. Final route order: 01 → [Weekly plan lands in the session store](../multi-session-day/issues/04-weekly-session-multi-session-prompt.md) → 02 → 03 → 04 → 05 → 07 → 08. Details: [Sequence the unified backlog](../calendar-implementation-route/issues/05-sequence-the-unified-backlog.md). Where this note and the body below disagree, the note wins.

## Problem Statement

The Training Plan calendar is read-mostly: the athlete can see their sessions as dots and expand one day at a time, but rearranging the week around real life — the glossary's promised "self-service move" — has no UI. Athletes with a busy week must either skip sessions or open a coaching conversation for what is really a scheduling action. There is also no way to record training the Coach didn't plan (stretching, strength work), and the inline day expansion is too cramped to hold everything a session carries.

## Solution

Weeks in the monthly calendar expand in place into rows of draggable Session Blocks. The athlete drags sessions between days: silently within a week, and across weeks with a one-time educational Move Checkpoint (first two completed Cross-Week Moves only — after that, trust). Rest days are dominant and never displaced; training stacks into Doubles; skipped and unavailable sessions revive when moved. The athlete can add their own supplemental Athlete Sessions, including retro-logging forgotten ones within the current week. Tapping any block opens the Session Drawer — a right-side panel that becomes the single home for all session detail and actions, replacing the inline expansion. Every move is logged silently; the Coach raises Cross-Week Moves at the next Weekly Session and reads the rest as Pattern Insight material.

## User Stories

1. As an athlete, I want to tap a week row and see all its sessions as blocks under their days, so that I can read my week's shape at a glance.
2. As an athlete, I want to expand several weeks at once (and expand/collapse all with one toggle), so that I can see both the week I'm moving from and the week I'm moving to.
3. As an athlete, I want to drag a session to another day in the same week without any ceremony, so that my plan fits my life without a conversation.
4. As an athlete, I want to drag a skipped or unavailable session to a new day and have it become planned again, so that a missed Tuesday can still happen on Saturday.
5. As an athlete moving a session to a different week, I want the Coach to warn me once or twice about what that does to my training load — and then trust me, so that I'm educated without being nagged.
6. As an athlete, I want my rest days protected — anything I drop on them parks as unavailable until the Rest itself moves, so that I can't accidentally train through recovery.
7. As an athlete, I want to stack multiple training sessions on one day, so that doubles (a normal part of Ironman training) are possible.
8. As an athlete, I want to add my own sessions (Mobility, Strength, Other with a training/not-training toggle), so that the work the Coach didn't plan still counts.
9. As an athlete, I want to retro-log a session I forgot to add earlier this week, created directly as completed with the rating prompt right there, so that my record stays honest.
10. As an athlete, I want to tap any session and get a right-side drawer with everything about it — detail, rating, actions — so that nothing is hidden in a cramped inline panel.
11. As an athlete, I want the Coach to know how I've rearranged my plan when we talk at the Weekly Session, so that my scheduling reality informs next week's plan.

## Implementation Decisions

**Three new modules, layered (built and tested in this order):**

1. **Session store** — persistence and identity. Sessions become identity-bearing entities (the ADR 0002 refactor), replacing date-keyed plan/feedback lookups. Owns CRUD, week/day queries, the Session Move log, the Cross-Week Move counter, and one-time migration of existing localStorage data (week plan, plan history, session feedback) into the new shape. Future weeks materialize as real stored Planned Sessions (seeded from the existing phase templates) instead of being computed at render time — they must be mutable. Knows nothing about rules. Canonical session shape (encodes the decisions; field names indicative):

   ```js
   {
     id, dateKey, type,            // type: Endurance|Intensity|Tempo|Recovery|Rest|Mobility|Strength|Other
     origin: 'coach' | 'athlete',
     status: 'planned' | 'completed' | 'skipped' | 'unavailable',
     parked: false,                // true = unavailable caused by Displacement; auto-restores
     isTraining: true,             // Other-type toggle; Mobility=false, Strength=true
     duration, zone, note,         // note = Coach note (coach origin) or athlete's own
     feedback: { body, mind, comment } | null,
   }
   ```

2. **Move rules** — pure functions, no storage, no DOM. `classifyMove` (frozen classes, immutable past weeks, past-day targets bounce, within-week vs cross-week), `resolveDrop` (place / Double / park-incoming / displace-occupants, per Rest dominance and non-load coexistence), `needsCheckpoint` (completed-moves counter, twice then never).

3. **Move orchestrator** — the thin public API the UI calls: apply a move (classify → resolve → persist → log), create/edit/delete Athlete Sessions (including retro-log as completed), and the auto-restore sweep (Rest leaves a day → its parked sessions revert to planned).

**Calendar UI changes:**

- Week rows toggle into Expanded Weeks (accordion in place, multiple at once); a header control expands/collapses all. Collapsed weeks keep today's dot rendering; a day with multiple sessions shows multiple dots.
- Session Blocks: colour by Session Type (existing palette plus Strength purple, Mobility teal, Other neutral grey), status styling mirroring dots, parked blocks badged. Drag via pointer events; collapsed weeks' day cells are valid drop targets (that's how a Cross-Week Move can land without expanding the target).
- "+" affordance per day in an Expanded Week (today, future, and past days of the current week; on Rest days it offers only non-training types).
- The inline `cal-expansion` is deleted, along with its planning-day panel — both jobs move to the Session Drawer.

**Session Drawer:** right-side slide-in mirroring the Navigation Drawer (overlay, tap-outside closes). Renders per origin: coach sessions read-only content with skip/unavailable/rate/discuss actions; Athlete Sessions editable and deletable; create mode for "+"; Weekly Session CTA when opened from the planning-day marker. Retro-log create flow chains straight into the existing feedback prompt.

**Move Checkpoint:** modal on a Cross-Week Move drop while the completed-move counter is below two — static Coach-voice copy, optional comment (stored as Pushback Rationale on the move log entry), Move / Don't move. Cancel does not increment the counter.

**Server prompt change:** the Weekly Session prompt gains the week's move log (cross-week moves flagged, with comments) so the Coach can raise them, consistent with "context is gathered at the next Weekly Session."

**Translations:** all new labels through the existing `t()` layer, English + Danish.

## Testing Decisions

Test external behavior only; the rule matrix from the grill session is the spec.

- **Move rules (pure):** exhaustive table-driven tests — every legality/conflict/checkpoint cell becomes a row. No mocks, no DOM. This is where correctness lives.
- **Session store:** storage behavior only — create/query round-trips, migration preserves existing plan and feedback data, log accumulates. jsdom for localStorage.
- **Orchestrator:** a handful of story-level tests through the public API, e.g. "drop Rest on training day → occupant parks; move Rest away → occupant restores planned," "third cross-week move needs no checkpoint but is still logged." No re-testing of matrix cells.
- **Calendar + Drawer DOM:** jsdom tests in the style of the existing conversation-button tests (inline DOM, `api.js` mocked): expansion toggling, block rendering per status, drawer content/actions per origin, checkpoint appearing on a cross-week drop. Drops invoke the exported drop handler directly — pointer gestures are verified manually in the browser, not simulated in jsdom.
- **Existing seams extended:** translation-key tests; server prompt test that the move log reaches the Weekly Session system prompt.

Prior art: the existing conversation-buttons, translations, and server-prompts test files.

## Out of Scope

- Coached Mode and everything from ADR 0003 (Head Coach, Prescribed Sessions, Roster View, Coach Briefing) — V1. The optional mock-roster POC preview is also out of this PRD.
- Retro-logging beyond the current week; editing past weeks in any form.
- Coach-generated, context-specific Move Checkpoint copy (static copy in POC; product upgrade later).
- A "Move to…" button in the Session Drawer (drag is the only move mechanism until touch proves clumsy).
- In-the-moment Coach reactions to moves, stacking, or Athlete Session creation — the Coach reacts at the Weekly Session only.
- Wearable-triggered completion, load analytics, and any Doubles-aware automatic load logic beyond prompt context.

## Further Notes

- ADR 0002 records why the authority model is shaped this way; the domain expert has not yet validated Rest dominance, unlimited Doubles, or athlete-owned Strength (questions file, section 9). Build proceeds on current decisions; expert answers may adjust copy and defaults, not architecture.
- The migration must be idempotent and non-destructive — existing POC users (Mads, the domain expert) have live localStorage state.
- Rest blocks render in an Expanded Week even though Rest previously wasn't drawn at all — Rest is content now (it can be moved, and it dominates).
