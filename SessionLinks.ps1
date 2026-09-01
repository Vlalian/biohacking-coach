<#
  SessionLinks.ps1 - the ONE definition of how a worktree's .claude is linked.

  Dot-source it; do not run it:
      . "$PSScriptRoot\SessionLinks.ps1"

  --------------------------------------------------------------------------
  Why this file exists (2026-09-01, same day as the split it repairs)

  The .claude hazard fix landed the linking policy in New-Session.ps1 and then
  restated it, verbatim, in Repair-SessionLinks.ps1 - while Remove-Session.ps1,
  which has to UNDO that policy, knew nothing about it and enumerated whatever
  it found on disk instead.

  Three scripts, two copies of the rule, and the one responsible for the
  destructive half not holding either. That is exactly the shape of the bug
  the whole exercise was about: a rule kept in more than one place drifts, and
  the copy that drifts is discovered by damage.

  So the deny-list, the copy-list and the plan they produce live here, and the
  three scripts agree by construction rather than by review.
  --------------------------------------------------------------------------
#>

# Never link these out of the canonical .claude, whatever else appears there.
#
# worktrees\ is the whole point - it holds every live session, and a link to it
# means a recursive delete of one worktree reaches all of them. The rest is
# per-session state that must not be shared between sessions.
$ClaudeNeverLink = @("worktrees", "projects", "todos", "shell-snapshots", "statsig")

# Files Claude Code rewrites for itself. A hard link is SNAPPED by an atomic
# write-then-rename, silently leaving a private fork - the exact failure the
# linking exists to prevent. Per-session permissions are meant to differ, so a
# copy is correct here rather than a compromise.
$ClaudeCopyNotLink = @("settings.local.json")

function Get-ClaudeLinkPlan {
  <#
    .SYNOPSIS
      What a worktree's .claude should contain, as three ordered maps of
      <relative path in worktree> -> <absolute target>.

    .DESCRIPTION
      Junction = directories, linked with mklink /J.
      HardLink = top-level files, linked with mklink /H (mklink /J is
                 directories only).
      Copy     = top-level files that must NOT be linked - see $ClaudeCopyNotLink.

      Children are ENUMERATED, not hardcoded, so something added to .claude
      later is picked up rather than silently left out. The deny-list is what
      keeps that from being dangerous.
  #>
  param([Parameter(Mandatory)] [string]$ClaudeSrc)

  $plan = [pscustomobject]@{
    Junction = [ordered]@{}
    HardLink = [ordered]@{}
    Copy     = [ordered]@{}
  }
  if (-not (Test-Path $ClaudeSrc)) { return $plan }

  foreach ($child in Get-ChildItem $ClaudeSrc -Force -Directory) {
    if ($ClaudeNeverLink -contains $child.Name) { continue }
    $plan.Junction[".claude\$($child.Name)"] = $child.FullName
  }
  foreach ($child in Get-ChildItem $ClaudeSrc -Force -File) {
    if ($ClaudeCopyNotLink -contains $child.Name) {
      $plan.Copy[".claude\$($child.Name)"] = $child.FullName
    } else {
      $plan.HardLink[".claude\$($child.Name)"] = $child.FullName
    }
  }
  return $plan
}
