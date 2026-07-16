Status: ready-for-agent
Label: wayfinder:task

# 13 — The Coach Briefing

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The Coach Briefing: the Head Coach's own conversation with the Coach about a linked athlete — the AI briefing the human on where their athlete stands.

Ticket 02 scoped the Briefing **in** for the eval. It is a conversation like any other: `conversations.kind = coach_briefing`, with `coach_id` naming the briefing's owner (ticket 05, ballot 4). This is why the conversations table carries a nullable `coach_id` — a Briefing belongs to a coach, not only to an athlete.

Link Visibility gates what the Briefing may draw on, and **both** flags gate it. If `share_ai_transcripts` is false, the athlete's Coach conversations are not the Briefing's material; if `share_training_data` is false, the training data slice 11 withholds from the Roster is likewise not the Briefing's material. The gate is server-side and it applies to what feeds a prompt, not just to what renders — withheld data must never be fetched into prompt inputs at all. A Briefing that quietly summarises what the coach is not permitted to read defeats the toggle.

GDPR decision 1 holds here as everywhere: no real identity in prompts.

This is a V1 coach surface. The **Roster Briefing** — roster-wide AI analysis — is explicitly V2 and out of scope (ADR 0004). This slice briefs on one athlete at a time.

## Acceptance criteria

- [ ] The Head Coach opens a Briefing about a linked athlete and converses with the Coach
- [ ] The Briefing persists as `conversations.kind = coach_briefing` with `coach_id` set
- [ ] It survives a refresh
- [ ] The Briefing draws only on data the Coaching Link permits — with `share_ai_transcripts` false, athlete transcripts do not feed the prompt
- [ ] With `share_training_data` false, the training data slice 11 withholds is not fetched into prompt inputs either; the gate is server-side, not a filter applied after the fact
- [ ] A Head Coach cannot brief on an athlete they have no active link to
- [ ] No real name or email reaches the prompt
- [ ] No roster-wide briefing surface is built
- [ ] Tests cover persistence and both visibility gates on prompt material, each with the flag enabled and disabled

## Blocked by

`.scratch/eval-mvp-build/issues/11-coach-logs-in-and-sees-the-roster.md`
`.scratch/eval-mvp-build/issues/08-weekly-session-conversation.md`
