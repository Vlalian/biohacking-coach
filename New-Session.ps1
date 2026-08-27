<#
  New-Session.ps1 - start an isolated work session as a git worktree that shares
  the ONE canonical set of gitignored docs.

  Run this from the main folder (biohacking-coach-main). Example:
      .\New-Session.ps1 -Name 17-foo -Branch build/17-foo

  It (1) creates a fresh worktree off origin/main, (2) junctions the gitignored
  doc folders back to the canonical copies (admin-free on Windows), (3) VERIFIES
  every junction actually landed, and (4) writes a gitignored CLAUDE.md that
  @-imports the canonical root docs by absolute path.

  Tear down with Remove-Session.ps1 - never with a bare 'git worktree remove'.

  --------------------------------------------------------------------------
  Why this script exists in the shape it does (2026-08-26)

  The tracker forked into FOUR divergent copies, and the only record that a
  finished piece of work had shipped lived in a worktree nobody would ever read
  again. The cause was copying: a copy is a fork the moment either side is
  written to. Junctions cannot fork, because there is only ever one directory.

  So this script now treats a failed junction as a FATAL error rather than
  something to swallow. A session that silently starts with a private copy of
  the tracker is the exact failure being designed out - better to refuse to
  create the worktree at all.

  Two bugs found the same day and fixed here:

  - It used to junction "docs" wholesale. That silently failed EVERY time,
    because docs/adr/ is tracked, so git checks the folder out and mklink
    refuses to link over an existing directory. Result: every worktree was
    missing docs/agents/ and docs/nfr.md, and nothing said so. Only the private
    subfolder is linked now.
  - It junctioned back to $Main, whose .scratch is now itself a junction to
    bc-docs. Chained junctions work until the middle link moves. Worktrees now
    point straight at the canonical repo.
  --------------------------------------------------------------------------
#>
param(
  [Parameter(Mandatory)] [string]$Name,
  [Parameter(Mandatory)] [string]$Branch,
  [string]$Base = "origin/main",
  # The canonical private-docs repo. The tracker lives here and NOWHERE else.
  [string]$Docs = "C:\Users\madsk\bc-docs"
)
$ErrorActionPreference = "Stop"

# The main folder = wherever this script lives.
$Main     = Split-Path -Parent $MyInvocation.MyCommand.Path
$DocsFwd  = $Docs -replace '\\','/'                       # forward slashes for @-imports
$MainFwd  = $Main -replace '\\','/'
$Worktree = Join-Path (Split-Path -Parent $Main) "bc-$Name"

if (Test-Path $Worktree) { throw "Worktree already exists: $Worktree" }
if (-not (Test-Path (Join-Path $Docs ".scratch"))) {
  throw "Canonical docs not found at $Docs\.scratch - pass -Docs, or fix the junction setup."
}

# Link plan: <relative path in worktree> = <absolute target>
#
# From $Docs: the things that CHANGE and are authoritative - the tracker, and
# the agent conventions that govern it. These must never be copied.
#
# From $Main: per-checkout tooling and static reference. .agents/ is deliberately
# NOT shared - the skills CLI mirrors it into .claude/skills/ as symlinks holding
# absolute paths into whichever checkout ran the install, so one shared copy
# would point every session at one checkout's paths.
$Links = [ordered]@{
  ".scratch"    = (Join-Path $Docs ".scratch")
  "docs\agents" = (Join-Path $Docs "docs\agents")
  "poc"         = (Join-Path $Main "poc")
  ".agents"     = (Join-Path $Main ".agents")
  ".claude"     = (Join-Path $Main ".claude")
}

# 1. Fresh copy of main.
git -C $Main fetch origin --quiet
git -C $Main worktree add $Worktree -b $Branch $Base

# 2. Junction the shared folders. A missing TARGET is skipped (poc/ may not
#    exist in every setup); a FAILED LINK is fatal, per the note above.
foreach ($rel in $Links.Keys) {
  $target = $Links[$rel]
  if (-not (Test-Path $target)) {
    Write-Host "  skip   $rel  (no target at $target)" -ForegroundColor DarkGray
    continue
  }
  $link = Join-Path $Worktree $rel

  # mklink refuses to link over anything that already exists. docs/ is the case
  # that matters: git checks out docs/adr/, so the PARENT exists and the child
  # must not. Create the parent, and fail loudly if the link path is occupied.
  $parent = Split-Path $link -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory $parent -Force | Out-Null }
  if (Test-Path $link) { throw "Cannot link $rel - something already exists at $link" }

  cmd /c mklink /J "$link" "$target" | Out-Null

  # 3. Verify. This is the whole point: an unverified junction that quietly did
  #    not happen is how a session ends up writing to a private copy.
  $item = Get-Item $link -Force -ErrorAction SilentlyContinue
  if (-not $item -or $item.LinkType -ne 'Junction') {
    throw "Junction FAILED for $rel -> $target. Refusing to hand over a worktree with a private copy of the docs."
  }
  Write-Host "  linked $rel -> $target" -ForegroundColor DarkGray
}

# 4. Gitignored CLAUDE.md that @-imports the canonical root docs by absolute path.
#    AGENTS.md is tracked, so it comes from the worktree's own checkout - that way
#    a branch that CHANGES the rules is read with its own version of them.
#    CONTEXT.md and OVERVIEW.md are gitignored and live in the main folder.
$claudeMd = @"
@$MainFwd/AGENTS.md
@$MainFwd/CONTEXT.md
@$MainFwd/OVERVIEW.md
"@
# WriteAllText writes UTF-8 WITHOUT a BOM (Set-Content -Encoding utf8 would add one,
# and a leading BOM can break the first @-import).
[System.IO.File]::WriteAllText((Join-Path $Worktree "CLAUDE.md"), $claudeMd)

Write-Host ""
Write-Host "Session ready: $Worktree  (branch $Branch)" -ForegroundColor Green
Write-Host "The tracker is shared from $Docs - it is the same directory, not a copy."
Write-Host "Tear down with:  .\Remove-Session.ps1 -Name $Name"
