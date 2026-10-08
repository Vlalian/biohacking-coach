# Rules for every agent in this repo

Rules only. Each rule names its source by number; the list is at the end. Where a rule has a file under
`docs/rules/`, open that file when the rule applies to what you are about to do.

## Mads' rules

1. At session start, read [local-context.md](docs/rules/local-context.md): start from the generated
   `CONTEXT-BRIEF.md`, use its terms exactly, and open `CONTEXT.md` before naming anything new. [1]
2. Before creating, entering or removing a worktree, or any `git checkout`, read
   [worktrees.md](docs/rules/worktrees.md): one worktree per session; a branch is not isolation. [1]
3. `New-Session.ps1` and `Remove-Session.ps1` are the only way to set up and tear down a session
   ([session-scripts.md](docs/rules/session-scripts.md)). [1]
4. Before writing under `.scratch/` or `docs/agents/`, confirm `.scratch` is a junction; never restore it
   by copying; if it is a plain directory, stop and say so ([junctions.md](docs/rules/junctions.md)). [1]
5. Only Mads starts `/code-review` or `/review-afk`. Commit and say plainly that the work is unreviewed
   ([code-review.md](docs/rules/code-review.md)). [1]
6. Before writing or changing code in `src/` or `scripts/`: domain language exactly, a pure core with I/O
   at the edges, the server owns the truth, no identifier reaches the LLM
   ([coding-conventions.md](docs/rules/coding-conventions.md)). [1]
7. Before writing or changing a test: test the exports and only the exports; spies only at boundaries;
   extract a hard-to-reach helper rather than exporting it for a test; when a refactor breaks an
   interface test, stop rather than edit the test to match ([testing.md](docs/rules/testing.md)). [1]
8. Before touching `src/components/ui` or `globals.css`: every primitive has a `*.visual.tsx`; run
   `npm run test:visual` before commit ([visual-snapshots.md](docs/rules/visual-snapshots.md)). [1]
9. A product-code change is done when lint, `tsc`, `npm test` and `npm run build` pass, run by you; or
   say plainly which one fails and why ([definition-of-done.md](docs/rules/definition-of-done.md)). [1]
10. When several unrelated routes 404 at once, delete `.next` and restart; a cold dev server shows the
    not-found page once per uncompiled route, so reload first
    ([stale-next-cache.md](docs/rules/stale-next-cache.md)). [1]
11. Before repeating a document's claim about the code, grep first. When doc and code disagree, the code
    is true and the doc gets fixed out loud ([verify-doc-claims.md](docs/rules/verify-doc-claims.md)). [1]
12. Never push or merge without consent from Mads. Never touch `main`. [2]
13. Edit, do not delete. Delete only a file you created yourself in this same session. [2]
14. Stage by path only. No `git add -A`, `git add .` or `git commit -a`: name each file you changed. [2]

## The fence

1. Never retype content that comes from another repo. It enters only through the step that brings it
   in. [3]
2. Locked files are never edited, not even for a typo (here: `docs/adr/**`, `CONTEXT.md`, `AGENTS.md`).
   If a change seems needed, propose it. [3]
3. Every change to where something came from is one appended line in its log. Never edit existing
   lines. [3]
4. Upstream changes are classified, never merged automatically. You may draft the PR; only a human
   merges it. [3]
5. The decisions ledger is law (here: `docs/adr/`). Nothing you write may contradict an active decision.
   Changing one is a new entry that supersedes it, never a silent edit. [3]
6. Before any PR, the repo's own checks must pass (rule 9 above). [3]

## Non-negotiables

1. Before you ask the human which approach to take, classify the question. If running something could
   answer it, try it and let the result decide. Ask only product or preference calls no experiment can
   settle. [4]
2. Under a full-autonomy grant, decide the calls the grant covers, act, and report each one. For a call
   only the human can make, apply a default and report it with what they could tell you to do instead.
   [4]
3. Before any code, name the data shape and the structure that organises it. [4]
4. Green is not safe. Nothing merges before an independent verdict on each PR. [4]
5. Treat bot reviewers sceptically: judge each comment on its merits; fix, dismiss with a concrete
   reason, or ask. [4]
6. A skill or tool that breaks mid-task is fixed in its own PR. Do not block on it, and do not work
   around it silently. [4]
7. Long, unattended or multi-phase work keeps a decision trail the human can audit later. [4]
8. Before reporting or acting on a number you measured, check what limits it and that it measured the
   work you think it did. [4]

## Autonomy

1. Reversible work proceeds without asking. [4]
2. Always pause before an irreversible write: force-pushing a shared branch, deploying, deleting data,
   messaging people. [4]
3. "Don't stop", "going to bed" or "run until done" means keep going. [4]
4. No is an acceptable answer: give your real judgement. Candour over agreement. [4]

## Subagents

1. You own every subagent's work. Review its diff and write your own summary. [4]
2. A second opinion is the same prompt against a different model. [4]
3. Give new work to a fresh subagent with the whole scope: the original brief, every later instruction,
   and the prior agent's report and branch. [4]

## Principles

Laziness; foundational thinking; redesign from first principles; attack the premise; subtract before you
add; minimise reader load; outcome-oriented execution; experience first; exhaust the design space; build
the lever; model the domain; boundary discipline; type-system discipline; idempotent operations; migrate
callers then delete the legacy API; separate before serialising shared state; prove it works; fix root
causes; sequence work into verifiable units; test behaviour, not implementation; explain the number;
guard the context window; never block on the human for reversible work; encode lessons in structure.
Each is stated in the workflow repo's `AGENTS.md`. [4]

## Repo upkeep

1. When you add, rename or change a skill, rule or doc page, update every index that lists it in the
   same change. [5]
2. Run the manifest or config validator after touching a manifest. [5]
3. No em-dashes in this repo's prose. Rewrite the sentence with a comma, colon, period or parentheses;
   never substitute the character blindly. [5]
4. Keep this file short: detail lives behind links. [5]

## Agent skills

- **Issue tracker**: issues are markdown files under `.scratch/`. See
  [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels**: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See
  [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs**: one `CONTEXT.md` at the repo root and `docs/adr/`. See
  [docs/agents/domain.md](docs/agents/domain.md).

## References

1. Kilstrup M. Working rules for biohacking-coach (docs/rules/) [Internet]. GitHub: Vlalian/biohacking-coach;
   2026 [cited 2026 Oct 7]. Available from: https://github.com/Vlalian/biohacking-coach/tree/dev/docs/rules
2. Kilstrup M. Rules for agents, given in chat to Claude Code [unpublished]. 2026 Oct 7.
3. backnotprop. AGENTS.md: the fence. In: product-engineering [Internet]. GitHub; 2026 Aug 26 [cited
   2026 Oct 7]. Commit 1ad8694. Available from:
   https://github.com/backnotprop/product-engineering/blob/1ad8694/AGENTS.md
4. Tan L. Poteto mode (skills/poteto-mode/SKILL.md). In: pstack, mirrored by backnotprop [Internet].
   GitHub; 2026 Oct 4 [cited 2026 Oct 7]. Commit 124f622. Available from:
   https://github.com/backnotprop/pstack/blob/124f622/skills/poteto-mode/SKILL.md
5. Pocock M. AGENTS.md. In: skills [Internet]. GitHub; 2026 Jul 13 [cited 2026 Oct 7]. Commit 697d4ce.
   Available from: https://github.com/mattpocock/skills/blob/697d4ce/AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
