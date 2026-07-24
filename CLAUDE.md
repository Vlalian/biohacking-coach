@AGENTS.md

## Why this file exists

Claude Code reads `CLAUDE.md`, not `AGENTS.md`. The `@AGENTS.md` line above imports the
working rules so they actually load into Claude sessions — without it they only ever reached
Claude through auto-memory, which is not a guarantee. Everything Claude Code needs lives in
`AGENTS.md`; keep it there so the other agents that read `AGENTS.md` (Copilot, Cursor, Codex)
get the same rules. This file is only the Claude-Code-specific bridge.

(A symlink would also work, but on Windows that needs Administrator privileges, so the
`@AGENTS.md` import is the portable choice here.)
