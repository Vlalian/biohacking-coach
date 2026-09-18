# Working rules

Each rule below lives in its own file under `docs/rules/`. The line here is the
headline; the file holds the full rule, its rationale, and the incident that
earned it. **Open the file when the trigger matches what you are about to do**
— the headline alone is not enough to act on.

## Every session

- **At session start**, read [local-context.md](docs/rules/local-context.md) —
  `CONTEXT.md`/`OVERVIEW.md` are gitignored; start from the generated
  `CONTEXT-BRIEF.md`, use its terms exactly, open `CONTEXT.md` before naming
  anything new. Claude Code has the brief auto-imported; other agents open it.

## Before you touch git or the tracker

- **Before creating, entering, or removing a worktree, or any `git checkout`**,
  read [worktrees.md](docs/rules/worktrees.md) — one worktree per session; a
  branch is not isolation; never `git add -A` beside a live session.
- **Before running `New-Session.ps1` / `Remove-Session.ps1`, or when a worktree
  is missing its docs**, read [session-scripts.md](docs/rules/session-scripts.md)
  — these two scripts are the only way to set up and tear down a session.
- **Before writing anything under `.scratch/` or `docs/agents/`**, read
  [junctions.md](docs/rules/junctions.md) — confirm `.scratch` is a junction;
  never restore it by copying; if it is a plain directory, stop and say so.
- **Before committing, or whenever a review seems warranted**, read
  [code-review.md](docs/rules/code-review.md) — only Mads starts `/code-review`
  or `/review-afk`; commit and say plainly the work is unreviewed.

## Before you write code

- **Before writing or changing code in `src/` or `scripts/`**, read
  [coding-conventions.md](docs/rules/coding-conventions.md) — domain language
  exactly, pure core with I/O at the edges, server owns the truth, no
  identifier reaches the LLM, tests colocated.
- **Before touching `src/components/ui` or `globals.css`**, read
  [visual-snapshots.md](docs/rules/visual-snapshots.md) — every primitive has a
  `*.visual.tsx`; run `npm run test:visual` before commit.
- **Before calling any product-code change done**, read
  [definition-of-done.md](docs/rules/definition-of-done.md) — lint, `tsc`,
  `npm test`, and `npm run build` all pass, run by you, or say plainly which
  one is failing and why.

## Before you write about the code

- **Before repeating a document's factual claim about the code** ("X never
  happens", "enforced in `file.js`"), read
  [verify-doc-claims.md](docs/rules/verify-doc-claims.md) — grep first; a
  "Where enforced" line is a hypothesis; when doc and code disagree, the code
  is true and the doc gets fixed out loud.

## Agent skills

- **Issue tracker** — issues are markdown files under `.scratch/`. See
  [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels** — `needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`, `wontfix`. See
  [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** — one `CONTEXT.md` at the repo root and `docs/adr/`. See
  [docs/agents/domain.md](docs/agents/domain.md).
