<#
  New-Session.ps1 - start an isolated work session as a git worktree that shares
  the ONE canonical set of gitignored docs from this main folder.

  Run this from the main folder (biohacking-coach-main). Example:
      .\New-Session.ps1 -Name 17-foo -Branch build/17-foo

  It (1) creates a fresh worktree off origin/main, (2) junctions the gitignored
  doc folders back to the canonical copies here (admin-free on Windows), and
  (3) writes a gitignored CLAUDE.md that @-imports the canonical root docs by
  absolute path - so every session starts from the same ground truth, and any
  doc edit lands on the one real copy. Delete the worktree when the PR merges;
  the junctions and generated CLAUDE.md go with it, the docs here stay put.
#>
param(
  [Parameter(Mandatory)] [string]$Name,
  [Parameter(Mandatory)] [string]$Branch,
  [string]$Base = "origin/main"
)
$ErrorActionPreference = "Stop"

# The canonical main folder = wherever this script lives.
$Main     = Split-Path -Parent $MyInvocation.MyCommand.Path
$MainFwd  = $Main -replace '\\','/'                       # forward slashes for @-imports
$Worktree = Join-Path (Split-Path -Parent $Main) "bc-$Name"

if (Test-Path $Worktree) { throw "Worktree already exists: $Worktree" }

# 1. Fresh copy of main.
git -C $Main fetch origin --quiet
git -C $Main worktree add $Worktree -b $Branch $Base

# 2. Junction the gitignored doc FOLDERS back to the canonical copies (no admin needed).
foreach ($d in ".scratch", "docs", "poc", ".agents", ".claude") {
  $src = Join-Path $Main $d
  if (Test-Path $src) { cmd /c mklink /J "$(Join-Path $Worktree $d)" "$src" | Out-Null }
}

# 3. Gitignored CLAUDE.md that @-imports the canonical root docs by absolute path.
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
Write-Host "Docs are shared from $Main - edits there are the ground truth."
