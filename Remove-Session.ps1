<#
  Remove-Session.ps1 - safely tear down a session worktree made by New-Session.ps1.

  It unlinks the doc junctions FIRST (removing the links only, never their
  targets), then removes the worktree. This matters: letting 'git worktree remove'
  delete the folder while the junctions are still in place can follow them and
  wipe the canonical docs in the main folder. Always tear down with this script.

  Run from the main folder. Example:
      .\Remove-Session.ps1 -Name 17-foo
#>
param(
  [Parameter(Mandatory)] [string]$Name
)
$ErrorActionPreference = "Stop"

$Main     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Worktree = Join-Path (Split-Path -Parent $Main) "bc-$Name"

if (-not (Test-Path $Worktree)) { throw "No such worktree: $Worktree" }

# 1. Unlink the junctions. Delete(path, $false) removes the reparse point only -
#    it never recurses into (or deletes) the target the junction points at.
foreach ($d in ".scratch", "docs", "poc", ".agents", ".claude") {
  $p = Join-Path $Worktree $d
  if (Test-Path $p) { [System.IO.Directory]::Delete($p, $false) }
}

# 2. The worktree now holds no junctions - safe for git's recursive delete.
git -C $Main worktree remove $Worktree --force

Write-Host ""
Write-Host "Removed session worktree: $Worktree" -ForegroundColor Green
Write-Host "The branch still exists. Once its PR is merged, delete it with:"
Write-Host "    git -C `"$Main`" branch -D <branch>"
