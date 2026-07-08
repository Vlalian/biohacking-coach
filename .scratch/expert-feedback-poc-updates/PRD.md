Status: done

# PRD — POC Updates from Domain Expert Interview

## Problem Statement

The POC was built on design assumptions about how Ironman coaching actually works. A structured domain expert interview (conducted 2026-06-22 with an active Ironman trainee under human coaching, medicine and training background) revealed four concrete gaps between the POC behaviour and real coaching practice:

1. The Session Feedback scale (1–5 emoji) does not match the RPE 1–10 standard that coaches and athletes already use. A five-point scale loses signal granularity and would feel amateurish to a serious athlete.
2. The Weekly Session system prompt asks the athlete about constraints *before* presenting the week plan. Real coaches present the plan first, then ask if it fits — not the other way around.
3. Pattern Insights are fully invisible. Real coaches surface consistent patterns during the coaching session as observations and normalisation — e.g. "I've noticed intensity sessions tend to score lower for you — that's common in this phase." The current silent-only model misses a key trust-building move.
4. The POC has no way for an athlete to mark a session as skipped without opening a full conversation. Real athletes just mark it as not done and explain it in the next weekly session — they don't want to justify every skip in the moment.

## Solution

Four targeted updates to the POC that bring it in line with validated coaching practice. Each is a narrow change to an existing module — no new architecture required.

1. **RPE 1–10 feedback scale** — replace the 5-emoji row with a 10-point RPE selector (number + illustrative label) in the Session Feedback Prompt. Update storage format accordingly.
2. **Weekly Session prompt reorder** — update the Weekly Session system prompt to propose the Week Plan first ("here's what I'm thinking for this week"), then ask if it fits the athlete's life. Remove the constraints-first framing.
3. **Pattern surfacing in Weekly Session** — update the Weekly Session system prompt to surface consistent patterns (when present in the session history) as a named observation during the Review phase. Framing: observation + normalisation, never criticism or data reporting.
4. **Session skip marking** — add a "Mark as skipped" action to Planned Session expansion panels in the Training Plan calendar. No conversation required. Stores a `skipped` status against the session in localStorage. Skipped sessions show a muted dot. The Weekly Session prompt includes a summary of skipped sessions so the Coach can reference them naturally during Review.

## User Stories

1. As an Ironman trainee, I want to rate my sessions on a 1–10 RPE scale so that my feedback uses the same language my human coach uses.
2. As an Ironman trainee, I want the RPE rating to show an illustrative label alongside the number so that the scale feels intuitive rather than abstract.
3. As an Ironman trainee, I want my Body Feedback and Mind Feedback stored as RPE 1–10 values so that the Coach can read meaningful signal from them.
4. As an Ironman trainee, I want the Coach to present the week plan before asking about my schedule so that I can react to a concrete proposal rather than pre-declaring constraints into a void.
5. As an Ironman trainee, I want the weekly plan proposal to feel like a coach laying out a recommendation ("here's what I'm thinking") rather than asking me to fill in a form.
6. As an Ironman trainee, I want the Coach to name a consistent pattern it has noticed during the Weekly Session so that I learn things about myself I might not have seen.
7. As an Ironman trainee, I want pattern observations to be framed as coaching intuition and normalisation ("that's common in this phase") rather than data reporting, so that it feels human.
8. As an Ironman trainee, I want to mark a session as skipped without having to open a conversation, so that logging a missed session takes under five seconds.
9. As an Ironman trainee, I want a skipped session to show as a muted dot in the Training Plan calendar so that I can see my completion record at a glance.
10. As an Ironman trainee, I want the Coach to acknowledge skipped sessions naturally during the Weekly Session Review without me having to re-explain them, so the weekly conversation feels informed rather than starting from scratch.

## Implementation Decisions

### RPE 1–10 scale

- The Session Feedback Prompt modal replaces the two 5-button emoji rows with two 10-button RPE rows. Each button shows a number (1–10). An illustrative label appears below the selected value (e.g. 1–2: "Almost no effort", 3–4: "Easy", 5–6: "Moderate", 7–8: "Hard", 9: "Very hard", 10: "Maximum"). Label text to be finalised against RPE standard descriptions.
- Storage format changes from `{ body: 1–5, mind: 1–5 }` to `{ body: 1–10, mind: 1–10 }`. Existing localStorage entries with the old format are ignored (POC, no migration needed).
- The Weekly Session prompt receives RPE values as-is (1–10 numbers). The prompt already aggregates and summarises them — no change to the aggregation logic, just the scale.
- The `preload: false` / `preload: true` distinction (new vs. edit) is unchanged.

### Weekly Session prompt reorder

- In `buildWeeklyContext` (server-side), the Planning phase instruction changes from "ask the athlete about their week constraints before building the plan" to "propose the week plan first, then ask if it works for the athlete's life."
- The Coach's opening move in the Planning phase should be a direct proposal: "Here's what I'm thinking for next week: [plan]. Does that work, or is there anything that needs moving?"
- No schema changes. Prompt-only change.

### Pattern surfacing

- In `buildWeeklyContext`, the Review phase instruction is updated to include: if consistent patterns are detectable from the session history passed in (e.g. Mind Feedback consistently low on intensity sessions, Body Feedback drops after low-sleep weeks), the Coach should surface the most significant one as an observation and normalisation during the Review phase.
- Framing rule injected into the prompt: pattern observations must be framed as "I've noticed X tends to happen — that's common" not "your data shows" or "your score was."
- The Coach names at most one pattern per Weekly Session to avoid overwhelming the athlete.
- Patterns are only surfaced when there are enough sessions in history (guard: at least 3 sessions with feedback before pattern observations are made).

### Session skip marking

- Planned Session expansion panels gain a "Mark as skipped" button (alongside the existing "Discuss with Coach" button).
- Clicking it sets the session's status to `skipped` in localStorage (under the existing `bh_session_feedback` key structure, adding a `skipped: true` flag to the day's entry).
- The calendar dot for a skipped session renders as muted (existing muted style, already defined).
- The Weekly Session prompt receives a `skippedSessions` array alongside `weekFeedback`, listing days that were skipped that week. The Coach uses this context silently during Review — it doesn't need to be called out unless relevant.
- No conversation is triggered by marking as skipped. The action is instant and reversible (a second click or a "Rate this session" action replaces the skip status).

## Testing Decisions

Good tests verify behaviour through the seams, not implementation details.

**Seam 1 — Session Feedback module:** Given a user selects RPE 7 for Body and RPE 4 for Mind and clicks Save, the stored object contains `{ body: 7, mind: 4 }` and the correct illustrative label was shown for each selection. The modal opens blank for new sessions and pre-filled for edits.

**Seam 2 — Weekly Session prompt:** Given a session history with 4+ sessions where Mind Feedback averages below 5 on intensity days, the Coach response during Review includes a pattern observation framed as observation + normalisation. Given a session history with fewer than 3 sessions, no pattern observation is made.

**Seam 3 — Skip marking:** Given the athlete taps "Mark as skipped" on a Planned Session, the dot renders muted without opening a conversation. The skipped day appears in the `skippedSessions` context passed to the next Weekly Session API call.

Manual verification is sufficient for the POC — no automated test infrastructure exists yet.

## Out of Scope

- Self-service session rescheduling (drag/move sessions to different days) — requires significant calendar interaction design. Noted as a V1 feature.
- Monthly Review Session — V1 feature, not MVP.
- Carbohydrate intake as a dedicated field — the comment field already supports this; no structured field needed in the POC.
- RPE labels in languages other than English — POC only.
- Migration of existing localStorage feedback data from 1–5 to 1–10 — POC, no migration.

## Further Notes

- All four changes are prompt or UI updates to the existing POC. No new routes, no new localStorage keys (except `skipped` flag on existing feedback entries), no architecture changes.
- Training phase and session type validation against Joe Friel's Triathlete's Training Bible is a separate research task, not a POC code change.
- The expert confirmed the weekly rhythm model (once per week formal session) is correct. The RPE, pattern surfacing, planning order, and skip marking are the four actionable POC gaps.

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): all child issues done and feature verified present in the POC. Status set to done.
