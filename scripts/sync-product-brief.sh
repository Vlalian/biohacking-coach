#!/bin/bash
#
# Keeps `src/features/feedback/product-brief.generated.ts` in step with the
# docs it is condensed from, by opening a pull request when they move.
#
# The Feedback Interview is told what the app is from that generated file, and
# `scripts/product-brief.mjs` builds it from two files in the private docs repo:
# `CONTEXT-BRIEF.md` (itself rebuilt by the bc-docs Stop hook whenever the
# glossary changes) and `.scratch/post-testing/planned-features.md`. Rerunning
# the script by hand after every glossary edit is the step that gets forgotten,
# and a stale brief means the interviewer describes an app that no longer
# exists. So the bc-docs Stop hook starts this in the background at the end of
# every session (Mads's call, 2026-09-30: a local hook, not a GitHub Action).
#
# What it does, and only when the two inputs changed since its last run:
#   1. regenerates the brief in a throwaway worktree off origin/main,
#   2. updates the interviewer's golden prompt snapshot and runs the feedback
#      tests, which also hold the no-personal-data checks,
#   3. commits exactly those two files and opens a pull request — or, if one
#      of its pull requests is still open, adds the commit to that one.
#
# It never merges, never force-pushes and never deletes a branch: the brief is
# prompt text that testers will read the effect of, so a person merges it.
# Every failure is logged and exits 0; a session end is never blocked by it.
#
#     bash scripts/sync-product-brief.sh            # what the hook runs
#     BRIEF_SYNC_DRY_RUN=1 bash scripts/...         # stop before push and PR
#
# Log: <git common dir>/product-brief-sync/log

MAIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS="${BC_DOCS_DIR:-/c/Users/madsk/bc-docs}"
BASE="${BRIEF_SYNC_BASE:-origin/main}"
DRY_RUN="${BRIEF_SYNC_DRY_RUN:-}"

GENERATED="src/features/feedback/product-brief.generated.ts"
SNAPSHOTS="src/features/feedback/__snapshots__/"
BRIEF="$DOCS/CONTEXT-BRIEF.md"
PLANNED="$DOCS/.scratch/post-testing/planned-features.md"

STATE="$(git -C "$MAIN" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/product-brief-sync"
LOG="$STATE/log"
KEYFILE="$STATE/last-key"
LOCK="$STATE/lock"
# Under the main checkout on purpose: Node walks up from here and finds the
# main checkout's node_modules, so nothing is installed and nothing is linked.
# A junction inside a worktree is what a removal can follow; there is none.
WT="$MAIN/.claude/worktrees/auto-product-brief"

mkdir -p "$STATE" 2>/dev/null || exit 0
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"$LOG"; }

[ -f "$BRIEF" ] && [ -f "$PLANNED" ] || exit 0

# The cheap check, run on every session end: have the inputs, or the generator
# on the base, changed since the last completed run? Hashing two small files
# takes a few seconds at most; everything below only runs when the answer is yes.
generator=$(git -C "$MAIN" rev-parse --verify -q "$BASE:scripts/product-brief.mjs" || echo none)
key="$(cat "$BRIEF" "$PLANNED" | git hash-object --stdin) $generator $BASE"
[ "$(cat "$KEYFILE" 2>/dev/null)" = "$key" ] && exit 0

# One run at a time: a Stop hook fires in every live session.
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than an hour belongs to a run that died; take it over.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi

cleanup() {
  git -C "$MAIN" worktree remove --force "$WT" >/dev/null 2>&1
  rmdir "$LOCK" 2>/dev/null
}
trap cleanup EXIT

finish() { echo "$key" >"$KEYFILE"; log "$*"; exit 0; }
fail() { log "FAILED: $*"; exit 0; }

log "inputs changed; checking the brief against $BASE"
git -C "$MAIN" fetch -q origin 2>/dev/null || fail "could not fetch origin (offline?) — will retry next session"

git -C "$MAIN" cat-file -e "$BASE:scripts/product-brief.mjs" 2>/dev/null \
  || finish "no scripts/product-brief.mjs on $BASE yet — nothing to keep in step"

# Stack on our own open pull request if there is one, so a busy week of
# glossary edits is one pull request, not five.
open_branch=$(cd "$MAIN" && gh pr list --state open --search "head:auto/product-brief" \
  --json headRefName --jq '[.[] | select(.headRefName | startswith("auto/product-brief-"))][0].headRefName // empty' 2>/dev/null)
if [ -n "$open_branch" ]; then
  start="origin/$open_branch"; branch="$open_branch"
else
  start="$BASE"; branch="auto/product-brief-$(date '+%Y%m%d-%H%M')"
fi

git -C "$MAIN" worktree remove --force "$WT" >/dev/null 2>&1
git -C "$MAIN" worktree prune >/dev/null 2>&1
git -C "$MAIN" worktree add -q --detach "$WT" "$start" 2>>"$LOG" || fail "could not create $WT"
cd "$WT" || fail "could not enter $WT"

out=$(node scripts/product-brief.mjs "$DOCS" 2>&1) || fail "product-brief.mjs refused: $out"

git diff --quiet -- "$GENERATED" && finish "brief already current on $start"

# The interviewer's golden prompt carries every line of the brief, so it moves
# with it. Update it, then run the feedback suite as it will run in CI.
export DATABASE_URL="${DATABASE_URL:-postgresql://placeholder:placeholder@localhost:5432/none}"
VITEST="$MAIN/node_modules/vitest/vitest.mjs"
[ -f "$VITEST" ] || fail "no vitest at $VITEST — run npm ci in the main checkout"
# The path goes before --update: the flag takes an optional value and would
# swallow a path after it, and the whole suite would rewrite every snapshot.
node "$VITEST" run src/features/feedback/feedback-prompt.golden.test.ts --update >>"$LOG" 2>&1 \
  || fail "updating the golden snapshot failed"
node "$VITEST" run src/features/feedback >>"$LOG" 2>&1 \
  || fail "the feedback tests fail on the regenerated brief — the docs need a look"

# Commit exactly the brief and the feedback snapshots. Anything else moving
# means something unexpected happened; stop rather than ship it.
unexpected=$(git status --porcelain | awk '{print $2}' | grep -v -e "^$GENERATED\$" -e "^$SNAPSHOTS")
[ -z "$unexpected" ] || fail "unexpected changes, not committed: $unexpected"

git add -- "$GENERATED" "$SNAPSHOTS"
git commit -q -m "Product brief: regenerated from the docs" -m \
"CONTEXT-BRIEF.md or planned-features.md changed in the docs repo, so the
Feedback Interview's brief and its golden prompt snapshot are rebuilt with
scripts/product-brief.mjs.

Written by scripts/sync-product-brief.sh from the bc-docs Stop hook, not by
a person deciding this was a good commit. The feedback tests passed on it." \
  || fail "commit failed"

if [ -n "$DRY_RUN" ]; then
  git show --stat --format='%s' HEAD >>"$LOG"
  git diff "$start" HEAD -- "$GENERATED" | grep -E '^[+-]  "' >>"$LOG"
  finish "DRY RUN: would push $branch and open a pull request; nothing left the machine"
fi

git push -q origin "HEAD:refs/heads/$branch" 2>>"$LOG" || fail "push of $branch failed"

if [ -n "$open_branch" ]; then
  finish "added a commit to the open pull request on $branch"
fi

changes=$(git diff "$start" HEAD -- "$GENERATED" | grep -E '^[+-]  "' | head -40)
url=$(gh pr create --base "${BASE#origin/}" --head "$branch" \
  --title "Product brief: regenerated from the docs" --body "$(cat <<EOF
The docs changed (\`CONTEXT-BRIEF.md\` or \`.scratch/post-testing/planned-features.md\`), so
\`scripts/sync-product-brief.sh\` rebuilt what the Feedback Interview is told about the app.

**What the interviewer now reads differently** (\`-\` removed, \`+\` added):

\`\`\`diff
$changes
\`\`\`

The golden prompt snapshot moved with it, and the feedback tests passed locally, including the
no-personal-data checks. **Unreviewed:** opened automatically by the bc-docs Stop hook. Read the lines above
and merge when they describe the app as it is.

Further doc edits before this merges are added to this pull request, not a new one.
EOF
)" 2>>"$LOG") || fail "gh pr create failed for $branch"

finish "opened $url"
