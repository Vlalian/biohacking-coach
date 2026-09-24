# Junction the tracker. Never copy it.

`.scratch/`, `docs/agents/` and `.claude/skills/` live in **one** place — the
private docs repo at `C:\Users\madsk\bc-docs` — and every clone and worktree
reaches them through a **junction**. They are the same directory, not a copy.

The skills joined them on 2026-09-22 (as `.agents/`, tracked in bc-docs so a
machine loss could not take all 24) and moved to `bc-docs/.claude/skills` on
2026-09-24, the one location Claude Code reads natively and a cloud Project
loads from every attached clone. The main folder's `.claude/skills` is a
junction straight into bc-docs, and `New-Session.ps1` links it into each
worktree child by child with the rest of `.claude`. There is no `.agents/` and
no generated `.claude/commands` mirror any more.

**Never restore them by copying.** A copy is a fork the moment either side is
written to, and the fork is silent: both sides look right, and the one that dies
is the one inside a worktree.

Before writing to a ticket, the map, or anything under `.scratch/`, confirm you
are writing to the real thing:

    (Get-Item .scratch -Force).LinkType     # must print: Junction

If it prints nothing, `.scratch` is a private copy. **Stop and say so** — do not
write to it, and do not delete it either; it may hold state that exists nowhere
else. Use `New-Session.ps1`, which junctions and then verifies, and refuses to
hand over a worktree whose links did not land (see
[session-scripts.md](session-scripts.md)).

Tear down only with `Remove-Session.ps1`. It unlinks junctions before removing
anything, and refuses outright to delete a worktree whose `.scratch` is a real
directory.

## What earned this rule

On 2026-08-26 the tracker was found forked into **four** divergent copies: two
clones with their own `.scratch` (219 and 154 files, both edited the same
evening) and two worktrees with their own again. `knowledge-oracle/02` read
`planned` in one and `done — ingested live, 31 sources / 1,583 chunks` in
another. The finished work was real; the record of it lived only inside a
worktree, and `git worktree remove` would have deleted it without a word. Two
divergent copies of `showable-version/MAP.md` existed, each holding findings the
other lacked.

The instruction that caused it used to sit in this very section — *"restore them
before working: copy them in from another working copy"*. It is recorded rather
than quietly deleted, because it was a reasonable instruction that solved the
wrong half of the problem: it restored the **content** and destroyed the
**identity**.
