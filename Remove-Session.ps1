<#
  Remove-Session.ps1 - safely tear down a session worktree made by New-Session.ps1.

  It unlinks the doc junctions FIRST (removing the links only, never their
  targets), then removes the worktree. This matters: letting 'git worktree remove'
  delete the folder while the junctions are still in place can follow them and
  wipe the canonical docs. Always tear down with this script.

  Run from the main folder. Example:
      .\Remove-Session.ps1 -Name 17-foo

  -Name resolves in BOTH places a session worktree can live: <parent>\bc-<Name>
  (New-Session.ps1's) and <main>\.claude\worktrees\<Name> (Claude Code's own
  isolation: "worktree"). It refuses rather than guesses if both exist.

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
  -CheckBranch: it answers the question, it does not do the deleting (2026-09-01)

  Tearing down a worktree deliberately leaves its branch alone. A worktree and
  a branch have different lifetimes, and the branch is often the only copy of
  work whose PR is still open. That separation stays.

  What was missing is not the deleting - it is knowing whether deleting is
  safe. GitHub SQUASH-merges here, which rewrites the commits, so a fully
  merged branch is NOT an ancestor of main and the safe delete refuses it with
  "error: not fully merged". The advertised way out is the force form, which
  checks nothing at all and is blocked by this repo's guardrail hook for good
  reason. So the two available answers were a refusal and a blunt instrument,
  and the actual question - is this branch's work in main? - went unanswered.

  -CheckBranch answers it by CONTENT: take the files the branch touched since
  its merge-base, and compare only those against main. All identical -> the
  work is in main whatever the commit graph says.

  It is deliberately strict in one direction. If main has moved further on a
  file the branch touched, it reports NOT VERIFIED even though the branch may
  be perfectly merged - which is exactly what happened to three squash-merged
  branches on 2026-09-01 once a later PR touched package.json and schema.ts.
  A false "keep this" costs one manual command; a false "safe to delete" is
  unrecoverable. When the two disagree, a merged PR on GitHub is the better
  authority, and the output says so.

  WHY IT DOES NOT DELETE. An earlier draft did, gated behind this same check.
  Mads's call, and the right one: this script deleting a branch would do it
  WITHOUT the guarded command appearing in anything an agent typed, so the
  guardrail hook would never see it. The hole would not be in the verification
  - that is stronger than what the force form gives you - but in the control.
  A safety hook that a helper script quietly routes around stops being a
  control at all. So the script answers, and a human runs the command.
  --------------------------------------------------------------------------
#>
param(
  [Parameter(Mandatory)] [string]$Name,
  # Tear down anyway, after you have reconciled a real .scratch by hand.
  [switch]$Force,
  # Also report whether the branch is safe to delete. Reports only - see the
  # header note on why this does not delete it for you.
  [switch]$CheckBranch,
  # What -CheckBranch compares the branch against.
  [string]$Base = "origin/main"
)
$ErrorActionPreference = "Stop"

$Main = Split-Path -Parent $MyInvocation.MyCommand.Path

# A session worktree lives in one of two places, and this script used to know
# only the first:
#
#   <parent>\bc-<Name>              New-Session.ps1 makes these.
#   <main>\.claude\worktrees\<Name> Claude Code's own isolation: "worktree".
#
# Only knowing the first meant every Claude-Code-created worktree had to be torn
# down by hand - which is precisely the "reach for git worktree remove because
# the script does not cover this case" move that caused the 2026-08-28 corpus
# deletion. A teardown script that covers most cases trains people out of using
# it for the rest.
#
# Note the second kind carries no junctions and often a REAL .scratch, so the
# refusal below is the one that fires for it. That is correct: those forks have
# held the only copy of tracker state more than once.
$candidates = [ordered]@{}
$candidates["bc-$Name"] = Join-Path (Split-Path -Parent $Main) "bc-$Name"
$candidates[".claude\worktrees\$Name"] = Join-Path $Main ".claude\worktrees\$Name"

$matched = @($candidates.Keys | Where-Object { Test-Path $candidates[$_] })

if ($matched.Count -eq 0) {
  throw @"
No such worktree: '$Name'. Looked in both places one can live:
    $($candidates["bc-$Name"])
    $($candidates[".claude\worktrees\$Name"])
"@
}
if ($matched.Count -gt 1) {
  throw @"
'$Name' is ambiguous - a worktree of that name exists in BOTH places:
$($matched | ForEach-Object { "    $($candidates[$_])" } | Out-String)
Rename one, or remove the one you mean with an explicit path. Guessing here
would delete the wrong session.
"@
}

$Worktree = $candidates[$matched[0]]

# Never saw off the branch you are standing on. git will happily remove the
# worktree a script is running inside, and the session doing it then cannot
# report what it destroyed - the same blindness as the .claude hazard.
$here = (Get-Location).Path.TrimEnd('\')
$target = (Resolve-Path $Worktree).Path.TrimEnd('\')
if ($here -eq $target -or $here.StartsWith("$target\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "REFUSING: you are inside $target. Run this from the main folder instead."
}

# Read the branch BEFORE the worktree goes - afterwards there is nothing to ask.
$Branch = $null
if ($CheckBranch) {
  $Branch = (git -C $Worktree rev-parse --abbrev-ref HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $Branch -or $Branch -eq 'HEAD') {
    Write-Host "-CheckBranch: cannot determine the branch (detached HEAD?) - skipping the check." -ForegroundColor Yellow
    $Branch = $null
  } else {
    $Branch = $Branch.Trim()
  }
}

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
$targets = @(".scratch", "docs\agents", "docs", "poc", ".agents")

# .claude, in the two shapes it can have. Order matters, and so does NOT
# enumerating through a junction.
#
#   Legacy: .claude is itself a wholesale junction to the canonical .claude.
#           Enumerating its children would read the CANONICAL folder and add
#           .claude\worktrees to the unlink list - a path that does not exist
#           in this worktree and must never be walked. So it is unlinked whole
#           and nothing is enumerated.
#
#   Current: .claude is a real directory holding per-child links. Enumerate it,
#           because a child added to .claude later must not be left linked -
#           the deny-list in SessionLinks.ps1 governs what New-Session puts
#           there, and this side deliberately removes whatever it FINDS rather
#           than what it expects, so the two cannot drift into a missed link.
$claudeDir = Join-Path $Worktree ".claude"
if (Test-Path $claudeDir) {
  if ((Get-Item $claudeDir -Force).LinkType -eq 'Junction') {
    $targets += ".claude"
  } else {
    foreach ($child in Get-ChildItem $claudeDir -Force -Directory -ErrorAction SilentlyContinue) {
      $targets += ".claude\$($child.Name)"
    }
  }
}

# Hard-linked files inside .claude (settings.json, launch.json) are left alone
# on purpose. Deleting a hard link removes that directory entry only; the file
# survives in the canonical folder. There is nothing to sever.

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
$removeExit = $LASTEXITCODE

Write-Host ""
if ($removeExit -eq 0) {
  Write-Host "Removed session worktree: $Worktree" -ForegroundColor Green
} else {
  # Do NOT claim success git did not report. `git worktree remove` can
  # deregister the worktree and empty it and still fail to delete the folder -
  # Windows holds directory handles open, so a leftover empty directory is the
  # common case rather than an exotic one. Saying "Removed" over the top of
  # that error is how a partial teardown gets believed and left half-done.
  $stillRegistered = (git -C $Main worktree list --porcelain) -match [regex]::Escape($Worktree)
  Write-Host "git worktree remove exited $removeExit for: $Worktree" -ForegroundColor Yellow
  if ($stillRegistered) {
    Write-Host "  STILL REGISTERED with git - the teardown did not happen. Investigate before retrying." -ForegroundColor Red
  } else {
    Write-Host "  Deregistered from git, so the worktree itself is gone." -ForegroundColor DarkGray
    if (Test-Path $Worktree) {
      $left = @(Get-ChildItem $Worktree -Force -ErrorAction SilentlyContinue)
      if ($left.Count -eq 0) {
        Write-Host "  An EMPTY directory is left at that path. Safe to delete by hand:" -ForegroundColor DarkGray
        Write-Host "      Remove-Item `"$Worktree`"" -ForegroundColor DarkGray
      } else {
        Write-Host "  $($left.Count) item(s) remain at that path - look before deleting anything." -ForegroundColor Yellow
      }
    }
  }
}

if (-not $CheckBranch -or -not $Branch) {
  Write-Host "The branch still exists. To find out whether it is safe to delete:"
  Write-Host "    .\Remove-Session.ps1 -Name <name> -CheckBranch"
  return
}

# Is every change this branch made already in $Base? Compare ONLY the files the
# branch touched, so a branch that is merely BEHIND $Base still reads as merged.
# Plain ancestry cannot answer this: GitHub squash-merges, which rewrites the
# commits, so a fully merged branch is not an ancestor and 'git branch -d'
# refuses it. See the header note.
git -C $Main fetch origin --quiet
$mergeBase = (git -C $Main merge-base $Base $Branch).Trim()
$touched   = @(git -C $Main diff --name-only $mergeBase $Branch)
$differing = if ($touched.Count -eq 0) { @() } else {
  @(git -C $Main diff --name-only $Branch $Base -- $touched)
}

Write-Host ""
if ($differing.Count -eq 0) {
  Write-Host "MERGED - '$Branch' is safe to delete." -ForegroundColor Green
  Write-Host "$Base matches it on all $($touched.Count) file(s) it touched."
} else {
  Write-Host "NOT VERIFIED - keep '$Branch' for now." -ForegroundColor Yellow
  Write-Host "$Base differs on $($differing.Count) of the $($touched.Count) file(s) it touched:"
  $differing | Select-Object -First 10 | ForEach-Object { Write-Host "    $_" }
  if ($differing.Count -gt 10) { Write-Host "    ... and $($differing.Count - 10) more" }
  Write-Host ""
  Write-Host "This means EITHER the work is not merged, OR it merged and $Base has moved"
  Write-Host "on since - and this check cannot tell those apart. If the PR shows as merged"
  Write-Host "on GitHub, that is the better authority; trust it over this line."
}

Write-Host ""
Write-Host "Deleting it is yours to run - deliberately not done here:"
Write-Host "    git -C `"$Main`" branch -D $Branch"
if (git -C $Main ls-remote --heads origin $Branch) {
  Write-Host "    git -C `"$Main`" push origin --delete $Branch"
}
