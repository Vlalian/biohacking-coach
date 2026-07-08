# The calendar splits authority: athlete owns placement, Coach owns content, Rest owns its day

The draggable calendar (Expanded Week + Session Move) lets athletes freely restructure their training week, which risks dissolving the Coach's ownership of training load — the product's core value. We split authority instead of choosing a side: the athlete may move any non-completed session to any current-or-future day (placement), but Coach-authored session content is read-only and undeletable — changing it is a coaching conversation, skipping it records reality. Rest blocks are dominant: dropping Rest onto training flips the training to unavailable, and training dropped onto Rest is parked as unavailable until the Rest moves — because recovery is what athletes protect least. Cross-Week Moves change weekly load distribution, so they get deliberate friction (Move Checkpoint) — but only for the athlete's first two completed moves, after which we trust the athlete and the Coach reacts at the next Weekly Session instead. All moves are logged silently and feed Pattern Insight.

## Consequences

- Sessions become identity-bearing entities, not attributes of a day — required by Doubles, Displacement limbo, and per-session Session Reflection. The POC's date-keyed storage (`bh_week_plan`, `bh_session_feedback`) must be refactored.
- Future weeks must hold real, athlete-mutable Planned Sessions — the POC's phase-template mock data for future weeks no longer suffices.
- The domain expert has not yet validated Rest dominance, unlimited Doubles, or athlete-owned Strength sessions — see `.scratch/mvp/domain-expert-questions.md` section 9.
