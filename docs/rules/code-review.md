# Only Mads starts a code review

`/code-review` and `/review-afk` are his to start. Do not run either on your own
initiative, and do not treat one as a step on the way to a commit.

The reason is cadence, not distrust. The old rule put a review on every commit,
which meant a review per task, and each one costs a session's worth of tokens —
they were being started far too often to be worth what they cost. He wants
several finished implementations gathered up first, then **one** review across
the batch. That is what `/plan-afk` and `/build-afk` accumulate on the
`afk/batch` branch, and what `/review-afk` spends.

So: finish the work, run the four checks in
[definition-of-done.md](definition-of-done.md), commit, and **say plainly that it
is built and unreviewed.** If you think a review is genuinely warranted on this
particular change, say so in one sentence and leave the call to him.

When he does run one: it applies to **code** — `src/`, `scripts/`, config that
affects the build. Not tracker files, ADRs, PRDs, or issue markdown; reviewing
prose with a code-review skill wastes a session and teaches everyone to ignore
the rule. Fix what it finds, or say plainly why you are not fixing it. A review
whose findings you skip silently is theatre.

CodeRabbit is the second pair of eyes, and also his call. It does **not** review
automatically on this repo — under 10 stars it must be triggered with
`@coderabbitai review`, so a green "CodeRabbit" check does not mean it looked.

## History

*Changed 2026-08-19.* This rule previously read "Run the `/code-review` skill on
product code before committing it, and before opening a pull request" — Mads's
standing instruction of 2026-07-16 — and is recorded rather than quietly deleted,
because the old rule was the right instinct and only its frequency was wrong.
There is no hook behind this one: it is an instruction, and it holds because
agents follow it.
