<#
  Repair-SessionLinks.ps1 - convert a worktree's wholesale .claude junction
  into the per-child links New-Session.ps1 now creates.

  Run from the main folder. Examples:
      .\Repair-SessionLinks.ps1 -WhatIf          # report only, change nothing
      .\Repair-SessionLinks.ps1                  # repair every bc-* worktree
      .\Repair-SessionLinks.ps1 -Name invite-machinery

  --------------------------------------------------------------------------
  Why this exists (2026-09-01)

  Worktrees created before today junction .claude wholesale to the canonical
  .claude - which contains worktrees\, holding every live Claude session on
  this machine. A recursive delete of such a worktree reaches all of them,
  including the session running the delete.

  New-Session.ps1 no longer creates that link. This script retires the ones
  already on disk. It is idempotent: an already-repaired worktree is reported
  and skipped.

  It only ever deletes REPARSE POINTS, never their targets, and it uses
  Directory.Delete(path, $false) - which refuses to recurse - rather than
  Remove-Item -Recurse, which is the call that caused the incident.
  --------------------------------------------------------------------------
#>
param(
  # Repair one worktree (the bc- prefix is optional). Omit to do all bc-* ones.
  [string]$Name,
  # Report what would change and touch nothing.
  [switch]$WhatIf
)
$ErrorActionPreference = "Stop"

$Main   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Parent = Split-Path -Parent $Main
$ClaudeSrc = Join-Path $Main ".claude"

# The link policy is defined once, in SessionLinks.ps1, so this script cannot
# drift from New-Session.ps1 - which is how it would silently start producing a
# layout the teardown script does not know how to undo.
. "$PSScriptRoot\SessionLinks.ps1"

if (-not (Test-Path $ClaudeSrc)) { throw "No canonical .claude at $ClaudeSrc - run this from the main folder." }

$worktrees = if ($Name) {
  $n = if ($Name.StartsWith("bc-")) { $Name } else { "bc-$Name" }
  @(Join-Path $Parent $n)
} else {
  Get-ChildItem $Parent -Directory -Filter "bc-*" | ForEach-Object { $_.FullName }
}

$repaired = 0; $skipped = 0
foreach ($wt in $worktrees) {
  if (-not (Test-Path $wt)) { Write-Host "missing: $wt" -ForegroundColor Yellow; continue }
  $leaf   = Split-Path $wt -Leaf
  $claude = Join-Path $wt ".claude"

  if (-not (Test-Path $claude)) {
    Write-Host "$leaf : no .claude - nothing to do" -ForegroundColor DarkGray; $skipped++; continue
  }

  $item = Get-Item $claude -Force
  if ($item.LinkType -ne 'Junction') {
    Write-Host "$leaf : .claude is already a real directory - already repaired" -ForegroundColor DarkGray
    $skipped++; continue
  }

  $reachable = (Test-Path (Join-Path $claude "worktrees"))
  $live = if ($reachable) { (Get-ChildItem (Join-Path $claude "worktrees") -Force -Directory -EA SilentlyContinue).Count } else { 0 }
  Write-Host "$leaf : wholesale junction -> $($item.Target)" -ForegroundColor Yellow
  if ($reachable) { Write-Host "         reaches $live live session worktree(s)" -ForegroundColor Red }

  if ($WhatIf) { Write-Host "         (WhatIf) would sever and relink per child" -ForegroundColor DarkGray; continue }

  # Sever the LINK only. Delete(path, $false) cannot recurse into the target.
  [System.IO.Directory]::Delete($claude, $false)
  New-Item -ItemType Directory $claude -Force | Out-Null

  $plan = Get-ClaudeLinkPlan -ClaudeSrc $ClaudeSrc

  foreach ($rel in $plan.Junction.Keys) {
    $link = Join-Path $wt $rel
    cmd /c mklink /J "$link" "$($plan.Junction[$rel])" | Out-Null
    $made = Get-Item $link -Force -EA SilentlyContinue
    if (-not $made -or $made.LinkType -ne 'Junction') { throw "Junction FAILED for $leaf\$rel." }
    Write-Host "         linked $rel" -ForegroundColor DarkGray
  }

  foreach ($rel in $plan.HardLink.Keys) {
    $link = Join-Path $wt $rel
    cmd /c mklink /H "$link" "$($plan.HardLink[$rel])" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "mklink /H failed for $leaf\$rel." }
    Write-Host "         hardlink $rel" -ForegroundColor DarkGray
  }

  foreach ($rel in $plan.Copy.Keys) {
    Copy-Item $plan.Copy[$rel] (Join-Path $wt $rel) -Force
    Write-Host "         copied $rel  (per-session by design)" -ForegroundColor DarkGray
  }

  if (Test-Path (Join-Path $claude "worktrees")) {
    throw "$leaf : .claude\worktrees is STILL reachable after repair. Stop and inspect by hand."
  }
  Write-Host "$leaf : repaired - worktrees\ is no longer reachable" -ForegroundColor Green
  $repaired++
}

Write-Host ""
Write-Host "Repaired $repaired, skipped $skipped." -ForegroundColor Green
