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
  Why .claude is linked piece by piece and not wholesale (2026-09-01)

  It used to be one junction: <worktree>\.claude -> <main>\.claude. That was
  fine while the target was an ordinary settings folder. It stopped being fine
  when the canonical checkout became the link target, because ITS .claude
  contains worktrees\ - where every live Claude session's worktree lives.

  So a recursive delete of any session folder walked .claude\ into the real
  .claude\worktrees\ and reached every live session on the machine, INCLUDING
  the one running the delete, which then could not report what it destroyed.
  A worse hazard than the .scratch one it was born from: that one destroys
  documents git can mostly return, this one destroys uncommitted code in
  several sessions at once.

  The interim rule was "always tear down with Remove-Session.ps1". That rule
  depends on a human remembering it at exactly the moment they are cleaning
  up - which is the moment the 2026-08-28 loss happened. So the link is gone
  rather than documented: every child of .claude is linked individually,
  worktrees\ is never one of them, and the dangerous path no longer exists to
  be walked at all.

  Directories become junctions. Top-level FILES cannot - mklink /J only links
  directories - so they are hard-linked instead, with one deliberate exception:

    settings.json, launch.json   HARD LINK. Hand-edited, rarely, and they have
                                 to be identical everywhere: settings.json is
                                 what wires the hooks into every session.
    settings.local.json          COPIED. Claude Code rewrites this file itself
                                 when it grants a permission, and an atomic
                                 write-then-rename SNAPS a hard link silently,
                                 leaving exactly the private fork this script
                                 exists to prevent. Per-session permissions are
                                 meant to differ, so a copy is correct here
                                 rather than a compromise.
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
}

# .claude is deliberately absent from the plan above. It is linked child by
# child, so that .claude\worktrees - which holds every live session - is never
# reachable from inside a worktree. See the header note.
$ClaudeSrc = Join-Path $Main ".claude"

# Never link these, whatever else appears in .claude later. worktrees\ is the
# whole point; the rest is per-session state that must not be shared.
$ClaudeNeverLink = @("worktrees", "projects", "todos", "shell-snapshots", "statsig")

# Files Claude Code rewrites itself. A hard link would be snapped by the
# rewrite and fork silently, so these are copied instead.
$ClaudeCopyNotLink = @("settings.local.json")

$FileLinks = [ordered]@{}   # hard links: <relative path> = <absolute target>
$FileCopies = [ordered]@{}  # plain copies, for the files above

if (Test-Path $ClaudeSrc) {
  foreach ($child in Get-ChildItem $ClaudeSrc -Force -Directory) {
    if ($ClaudeNeverLink -contains $child.Name) { continue }
    $Links[".claude\$($child.Name)"] = $child.FullName
  }
  foreach ($child in Get-ChildItem $ClaudeSrc -Force -File) {
    if ($ClaudeCopyNotLink -contains $child.Name) {
      $FileCopies[".claude\$($child.Name)"] = $child.FullName
    } else {
      $FileLinks[".claude\$($child.Name)"] = $child.FullName
    }
  }
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

# 3b. The .claude top-level files. Hard links, because mklink /J is directories
#     only. Verified the same way and just as fatally: a settings.json that
#     quietly did not link is a session running without the shared hooks.
foreach ($rel in $FileLinks.Keys) {
  $target = $FileLinks[$rel]
  $link   = Join-Path $Worktree $rel
  $parent = Split-Path $link -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory $parent -Force | Out-Null }
  if (Test-Path $link) { throw "Cannot link $rel - something already exists at $link" }

  cmd /c mklink /H "$link" "$target" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "mklink /H failed for $rel -> $target (exit $LASTEXITCODE)." }

  $item = Get-Item $link -Force -ErrorAction SilentlyContinue
  if (-not $item) {
    throw "Hard link FAILED for $rel -> $target. Refusing to hand over a worktree without the shared $rel."
  }
  # PowerShell 5.1 reports LinkType 'HardLink'; tolerate a null only if the
  # sizes agree, so a genuinely wrong file still fails loudly.
  if ($item.LinkType -and $item.LinkType -ne 'HardLink') {
    throw "Expected a hard link at $rel, found LinkType '$($item.LinkType)'."
  }
  if (-not $item.LinkType -and $item.Length -ne (Get-Item $target -Force).Length) {
    throw "Hard link unverifiable at $rel and the sizes disagree. Refusing."
  }
  Write-Host "  hardlink $rel -> $target" -ForegroundColor DarkGray
}

# 3c. The files Claude Code rewrites for itself. Copied on purpose - see header.
foreach ($rel in $FileCopies.Keys) {
  $target = $FileCopies[$rel]
  $link   = Join-Path $Worktree $rel
  $parent = Split-Path $link -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory $parent -Force | Out-Null }
  Copy-Item $target $link -Force
  Write-Host "  copied $rel  (per-session by design)" -ForegroundColor DarkGray
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
