<#
  Remove-Session.ps1 - safely tear down a session worktree made by New-Session.ps1.

  It unlinks the doc junctions FIRST (removing the links only, never their
  targets), then removes the worktree. This matters: letting 'git worktree remove'
  delete the folder while the junctions are still in place can follow them and
  wipe the canonical docs. Always tear down with this script.

  Run from the main folder. Example:
      .\Remove-Session.ps1 -Name 17-foo

  --------------------------------------------------------------------------
  Two changes, 2026-08-26.

  1. It used to call Directory.Delete on every name in a fixed list, assuming
     each was a junction. "docs" is NOT - docs/adr/ is tracked, so git checks
     out a real, non-empty directory there, and Delete(path, $false) throws on
     it. The throw landed AFTER .scratch had already been unlinked, leaving a
     half-dismantled worktree and a failed script. It now checks LinkType and
     only ever removes an actual reparse point.

  2. It refuses to remove a worktree holding a REAL .scratch directory. That is
     the signature of a session created without junctions - and that directory
     may be the only copy of tracker state that exists anywhere. Deleting it is
     how a finished piece of work becomes invisible. Reconcile it first.

  --------------------------------------------------------------------------
  2026-09-01: .claude is now linked child by child, and a wholesale one is
  refused outright.

  New-Session.ps1 used to junction .claude as a single link to the canonical
  .claude - which contains worktrees\, holding every live session on the
  machine. A recursive delete through it reached all of them, including the
  session running the delete. New worktrees link .claude's children
  individually and never worktrees\, so the path does not exist any more.

  Worktrees created BEFORE that change still carry the wholesale junction.
  Unlinking it first is safe and this script does it - but the check below
  refuses anyway if .claude\worktrees turns out to be reachable, because by
  then something has gone wrong that no amount of ordering will fix. Repair
  the worktree's links first; do not -Force past this one.
  --------------------------------------------------------------------------
#>
param(
  [Parameter(Mandatory)] [string]$Name,
  # Tear down anyway, after you have reconciled a real .scratch by hand.
  [switch]$Force
)
$ErrorActionPreference = "Stop"

$Main     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Worktree = Join-Path (Split-Path -Parent $Main) "bc-$Name"

if (-not (Test-Path $Worktree)) { throw "No such worktree: $Worktree" }

# 0. Refuse to destroy tracker state that exists nowhere else.
$scratch = Join-Path $Worktree ".scratch"
if ((Test-Path $scratch) -and -not (Get-Item $scratch -Force).LinkType) {
  $n = (Get-ChildItem $scratch -Recurse -File -ErrorAction SilentlyContinue).Count
  if (-not $Force) {
    throw @"
REFUSING to remove $Worktree.

Its .scratch is a REAL directory ($n files), not a junction - so this session
was created without the shared tracker, and those files may exist nowhere else.
Removing the worktree would delete them silently.

Reconcile first, e.g.:
    robocopy "$scratch" "<canonical>\.scratch" /L /E /NJH /NJS   # /L = dry run, list only

Then re-run with -Force.
"@
  }
  Write-Host "-Force given: removing a worktree with a real .scratch ($n files)." -ForegroundColor Yellow
}

# 1. Unlink the junctions - and ONLY the junctions. Delete(path, $false) removes
#    the reparse point without recursing into the target; guarding on LinkType
#    means a real directory (docs/, or an un-junctioned copy) is never touched.
$targets = @(".scratch", "docs\agents", "docs", "poc", ".agents", ".claude")

# .claude's children are linked individually now, so they have to be unlinked
# individually. Enumerate whatever is actually there rather than a fixed list -
# a child added to .claude later must not be silently left linked.
$claudeDir = Join-Path $Worktree ".claude"
if (Test-Path $claudeDir) {
  foreach ($child in Get-ChildItem $claudeDir -Force -Directory -ErrorAction SilentlyContinue) {
    $targets += ".claude\$($child.Name)"
  }
}

foreach ($rel in $targets) {
  $p = Join-Path $Worktree $rel
  if (-not (Test-Path $p)) { continue }
  $item = Get-Item $p -Force
  if ($item.LinkType -eq 'Junction') {
    [System.IO.Directory]::Delete($p, $false)
    Write-Host "  unlinked $rel" -ForegroundColor DarkGray
  }
}

# Last line of defence, checked AFTER unlinking. If a live session is still
# reachable from inside this worktree, the recursive delete below would take
# it - so stop, and do not offer -Force as a way past it.
$reachable = Join-Path $Worktree ".claude\worktrees"
if (Test-Path $reachable) {
  $live = (Get-ChildItem $reachable -Force -Directory -ErrorAction SilentlyContinue).Count
  throw @"
REFUSING to remove $Worktree.

$reachable is still reachable, and holds $live session worktree(s). Removing
this folder would recursively delete every one of them - including, most
likely, the session you are running this from.

This means a link inside .claude did not get severed above. Repair it by hand
before retrying:

    Get-Item "$reachable" -Force | Select-Object LinkType, Target

If it is a Junction, remove the LINK only - never with Remove-Item -Recurse:

    [System.IO.Directory]::Delete("$reachable", `$false)

-Force does NOT bypass this check, on purpose.
"@
}

# 2. The worktree now holds no junctions - safe for git's recursive delete.
git -C $Main worktree remove $Worktree --force

Write-Host ""
Write-Host "Removed session worktree: $Worktree" -ForegroundColor Green
Write-Host "The branch still exists. Once its PR is merged, delete it with:"
Write-Host "    git -C `"$Main`" branch -D <branch>"
