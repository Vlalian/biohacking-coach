Status: done

# 03 — Weekly Session: pattern surfacing as observation

## Parent

`.scratch/expert-feedback-poc-updates/PRD.md`

## What to build

Update the Weekly Session system prompt in `buildWeeklyContext` to instruct the Coach to surface a consistent pattern as a named observation during the Review phase — when the session history contains enough data to support one.

Current behaviour: Pattern Insights are fully invisible. The Coach uses patterns silently to shape the week plan but never names them. This misses a key coaching move that builds athlete self-awareness and trust.

Target behaviour: During the Review phase, if the session history passed to the prompt contains a detectable consistent pattern, the Coach names the most significant one as an observation with normalisation. Example: "I've noticed intensity sessions tend to score lower on your mind rating — that's pretty common in this phase of training." The Coach names at most one pattern per Weekly Session.

**Framing rules to inject into the prompt:**
- Frame as observation: "I've noticed…", "It looks like…"
- Normalise immediately: "that's common at this stage", "a lot of athletes feel this"
- Never frame as data reporting: do NOT say "your mind score was", "your average was", "the data shows"
- Never frame as criticism: do NOT say "you struggle with", "you have a problem with"
- After naming the pattern, invite the athlete to respond: "Does that match how it's felt for you?"

**Guard condition:** the Coach only surfaces a pattern if there are at least 3 sessions with RPE feedback in the history passed to the prompt. With fewer sessions, patterns are not mentioned. This guard should be expressed in the prompt instruction itself, not as code logic.

This is a prompt-only change. No schema changes, no new routes.

## Acceptance criteria

- [ ] With 3+ rated sessions in history, the Coach names one pattern observation during the Weekly Session Review phase
- [ ] The observation is framed as "I've noticed…" or similar — not "your data shows" or "your score was"
- [ ] The observation is immediately followed by a normalisation ("that's common at this stage" or similar)
- [ ] The Coach invites the athlete to respond after naming the pattern
- [ ] The Coach names at most one pattern per Weekly Session
- [ ] With fewer than 3 rated sessions in history, the Coach does not attempt to surface any pattern
- [ ] If no clear pattern is detectable, the Coach does not invent one

## Blocked by

`.scratch/expert-feedback-poc-updates/issues/01-rpe-feedback-scale.md` — pattern detection relies on RPE 1–10 values; the 1–5 scale has too little resolution for the prompt to reason meaningfully about patterns.
