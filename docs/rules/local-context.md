# Local context files (gitignored — read these first)

`CONTEXT.md` and `OVERVIEW.md` are **not in this repo**. They were removed from
version control when the repo went public (PR #24) and live in the private docs
repo (`bc-docs`, GitHub `Vlalian/Docs`) alongside the read-on-demand `.scratch/`
tracker and the project skills. On a machine they are linked into every working
copy; in a cloud Project with both repositories attached, they are the sibling
`Docs` clone. They remain the source of truth for this project's language and
orientation.

**Start every session from `CONTEXT-BRIEF.md`**, before writing code or issues.
It is the generated index of both files — the orientation table from `OVERVIEW.md`
(where truth lives, and the START HERE map) plus every glossary term from
`CONTEXT.md` with its first sentence. Use its terms exactly; don't drift to
synonyms. Then **read the full `CONTEXT.md` on demand** — before naming anything
new, writing an issue, PRD or ADR, or when a one-line entry is not enough; the
`_Avoid_` lists and the decisions behind each term live only there. `OVERVIEW.md`
§"Current state" is long-form status, read when you need it. `docs/` and
`.scratch/` are read on demand when a task calls for them.

The brief is **generated, never hand-edited**, and since 2026-09-24 it is written
into the docs repo and tracked there, so the cloud reads the same index:

    node scripts/context-brief.mjs C:/Users/madsk/bc-docs

Run it after editing either source, or the brief silently lags the glossary.
(Since 2026-09-15; the whole-file imports before that cost ~41k tokens per
session — see `.scratch/research/ecc-workflow-comparison.md` §7. The brief is
~6k.)

- **Claude Code** loads it automatically: this repo's gitignored `CLAUDE.md`
  `@`-imports `AGENTS.md` and the brief by absolute path into `bc-docs`, and the
  docs repo's own tracked `CLAUDE.md` imports it too, which is how a cloud
  Project gets it. Every Claude session already has the index.
- **Other agents** (Copilot, Cursor, Codex) do not `@`-import — open and read
  `CONTEXT-BRIEF.md` explicitly at session start.
- **A freshly-created worktree will not have these files** (they are gitignored,
  so they are never checked out from `main`). A missing file makes the `@`-import
  silently no-op, so an agent can lose the domain language with no error — confirm
  they are present. `New-Session.ps1` links them in; see
  [session-scripts.md](session-scripts.md).
