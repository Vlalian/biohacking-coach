Label: wayfinder:grilling
Status: done
Assignee: Claude + Mads (grill session 2026-07-16)

# Scope Coached Mode for the eval-MVP

## Question

[ADR 0003](../../../docs/adr/0003-coached-mode-authority.md) designs the whole Coached Mode surface, but it was scoped for V1 with a real roster. Given the eval has **one real athlete (Mads) + an optional synthetic roster**, which parts does the eval-MVP actually build, and which defer?

Decide, one at a time:

- **Roster View** — in? With one real athlete + synthetic roster, is it worth building the list surface, or is a single-athlete coach view enough to evaluate the experience?
- **Synthetic roster** — in or out for the eval (the "maybe" from the destination grill)? If in, how many, and do they reuse the four personas + synthetic Information View data?
- **Prescribed Sessions + three-tier authority** (Head Coach > AI Coach on content; AI only *suggests*; athlete keeps placement + reality; completed immutable) — full model, or a trimmed version for the eval?
- **Coach Briefing** (per-athlete interrogable AI channel for the coach) — in?
- **Narration with attribution** (AI Coach tells the athlete about every Head Coach action; no silent plan mutations) — in? This is core to the trust story, likely non-negotiable.
- **Coaching Link** — a real single-use invite flow, or a seeded link between two known accounts for the eval?

Output: the feature scope the server data model and build sequence hang on. Respect the standing scope principle — trim for the eval, but don't design a coach surface the full-product roster can't grow into.

## Blocked by

None — destination + athlete scope are enough to decide feature scope. Independent of the architecture/stack chain.

## Resolution (grill session 2026-07-16, six ballots, all Mads)

1. **Synthetic roster: IN, shallow by design** (Mads's own scoping, tighter than the recommendation): small synthetic athletes exist only to make the multi-athlete surfaces function and to show contrast between athletes — enough rows to make the roster real, NOT four rich datasets. **Mads's realistic data is the only full profile.**
2. **Roster View: in, MVP-trim** — the list + per-athlete view (calendar with coach permissions, Info View gated by Link Visibility). No analytics dashboards, no cross-athlete surface (ADR 0004 stands).
3. **Prescribed Sessions + three-tier authority: full rules, lean surfaces.** Every ADR 0003 authority rule enforced as permission guards (same pattern as garmin `origin` guards): Head Coach > AI on content, AI only suggests, athlete keeps placement + reality, Athlete Sessions view-only to coach, completed immutable. NO bespoke suggestion-approval UI — AI suggestions ride the Coach Briefing channel.
4. **Coach Briefing: in.** Per-athlete interrogable AI channel; one new prompt route (sixth in the POC's family) + a chat pane in the per-athlete view; respects Link Visibility. Roster-wide Briefing stays V2.
5. **Narration with attribution: in, the rule is non-negotiable** — no silent plan mutations; Head Coach actions land in an event log and the athlete-facing Coach narrates with attribution at the next meaningful touchpoint (app-open with pending events, or Weekly Session). No push notifications in the eval. **Manner/timing flagged for the coach interview** — question added to §12 of domain-expert-questions.md (would the coach rather announce big changes personally; any change that shouldn't narrate immediately).
   **AMENDED 2026-07-16 (Mads, during the ticket-05 data-model grill): narration BENCHED for the eval.** The *audit* half survives — every Head Coach action is still recorded with attribution in the events table (ticket 05) and visible in session details — but the Coach does not proactively announce coach changes; edits simply appear in the calendar. Acceptable because the eval's only real athlete is Mads himself. The §12 interview question stands, and narration (or equivalent) must come off the bench before any third-party athlete joins — ADR 0003's "no silent plan mutations" remains the product's trust rule. Un-benching is cheap by design: the event backlog will already exist.
6. **Coaching Link: seeded, not invited.** The link is a REAL `coaching_link` entity carrying Link Visibility toggles (training data on, AI-transcripts opt-in, calendar always visible per ADR 0003) that every permission check reads — but it's created by seed script, not an invite flow. Invite codes + severing UI defer to the full product; a future invite flow just creates the same row through UI. Visibility *enforcement* real; settings UI minimal (defaults suffice for the eval).

Output for [05 server-data-model](05-server-data-model.md): entities implied here = athlete, coach role, coaching_link (+ visibility), prescribed session origin/authority fields, coach-action event log, Briefing conversation state.
