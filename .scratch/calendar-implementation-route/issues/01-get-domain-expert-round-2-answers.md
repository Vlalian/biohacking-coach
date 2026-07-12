Label: wayfinder:task
Status: done
Assignee: Claude (session 2026-07-12)
Created: 2026-07-09

# 01 — Get domain expert round-2 answers

## Question

Sections 9 (Draggable Calendar) and 10 (Coached Mode) of [domain-expert-questions.md](../../mvp/domain-expert-questions.md) have been pending since 2026-07-05. Section 9 bears directly on this route: Rest dominance, unlimited Doubles, and athlete-owned Strength are all rules the Draggable Calendar issues encode. Get the round-2 answers from the domain expert and record them in the questions file.

Per the Draggable Calendar PRD's Further Notes, expert answers adjust copy and defaults, not architecture — so this ticket does not block the data-model or migration tickets. It blocks only the final backlog sequencing, so the rules-heavy issue rewrites (Rest dominance, Doubles, Athlete Sessions) are settled against real answers rather than assumptions.

HITL: contacting the expert is Mads's move. An agent session can help by preparing the ask (extracting section 9/10 into a sendable form) if useful.

## Resolution

Answered 2026-07-12 — the athlete expert was interviewed live in an in-chat grill session (Danish), covering sections 9, 10, and the new section 11 (Training Metrics & Nutrition). Answers recorded in [domain-expert-questions.md](../../mvp/domain-expert-questions.md) (status header) with the full findings summary in [PRD.md → Further Notes](../../mvp/PRD.md); challenged CONTEXT.md terms carry ⚠ annotations.

**Standing decision (Mads, 2026-07-12): these answers are project truth until V1.** A real human coach has been recruited but will not be interviewed before ~V1 (his questions are compiled as section 12 of the questions file). Do not defer route decisions waiting for coach validation.

Findings that bear on this route (for ticket 05 to apply):

1. **Cross-Week Move + Move Checkpoint — candidate for deletion.** The expert has never moved a session to another week: a missed session is simply missed, the week is the planning unit, and catch-up belongs in the Weekly Session. This exceeds "copy and defaults" — ticket 05 must decide whether Draggable Calendar issue 06 (cross-week-checkpoint) is closed-superseded and the Session Move drop-target rules narrowed to the current week.
2. **Rest dominance softened, level-dependent.** Mobility on Rest is already modelled correctly (coexists). But light training on recovery days is normal at higher levels; "one true rest day per week" is an age-grouper rule. For the POC/MVP audience (age-groupers) absolute Rest protection is an acceptable default — but the rule should be understood as level-dependent, and the Displacement copy should not moralise.
3. **Retro-log window removed** — no artificial deadline on back-filling (expert: logging is automatic via watch sync anyway; nobody should be blocked from recording reality). Affects issue 07 (athlete-sessions-retro-log), which currently limits retro-logging to the current week.
4. **Unlimited Doubles validated**; no in-the-moment blocking of any stacking — the app's job is continuous load/injury-risk assessment, not enforcement. Consecutive run days = a pattern to watch across weeks (Pattern Insight), never a block.
5. **Strength = athlete territory confirmed**, with Coach *suggestions* framed as "for those who want extra" (issue 07 copy).
6. **Within-week moves fully free**; expert additionally wants a lightweight post-move "is this still fine?" check with the Coach available on demand (Coach Chat covers this; no new mechanic required).
7. Pattern-reading-as-a-coach questions were beyond the expert ("jeg er ikke træner") — deferred to the section-12 coach interview at V1; Pattern Insight designs rest on our own reasoning until then.
