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
  [string]$Docs = "C:\Users\madsk\bc-docs",
  # Escape hatch for step 3b-ter: a DATABASE_URL to write instead of creating a
  # per-session Neon branch. Use it offline or when the Neon CLI is not logged
  # in. It must NOT be the production branch - see GDPR decision 8.
  [string]$DatabaseUrl,
  # Days until the per-session Neon branch expires on its own. Neon deletes it
  # then even if Remove-Session.ps1 was never run.
  [int]$BranchDays = 14
)
$ErrorActionPreference = "Stop"

# The Neon project. Ids, not secrets - the CLI needs them to skip its org prompt.
$NeonProject = "plain-sky-06454855"
$NeonOrg     = "org-patient-wave-37211297"
# Every non-production branch is cut from this schema-only, seeded branch and
# never from `production` (GDPR decision 8, 2026-09-11; .env.example explains).
$NeonParent  = "seed-template"

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
#
# The policy itself lives in SessionLinks.ps1, so this script, the repair
# script and the TEARDOWN script cannot drift apart. Do not restate it here.
. "$PSScriptRoot\SessionLinks.ps1"

$ClaudePlan = Get-ClaudeLinkPlan -ClaudeSrc (Join-Path $Main ".claude")

foreach ($rel in $ClaudePlan.Junction.Keys) { $Links[$rel] = $ClaudePlan.Junction[$rel] }
$FileLinks  = $ClaudePlan.HardLink   # hard links: <relative path> = <absolute target>
$FileCopies = $ClaudePlan.Copy       # plain copies - files Claude Code rewrites

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

# 3b-bis. .env.local - COPIED, and deliberately not linked.
#
# Without it a worktree cannot run `npm run build`: page-data collection reaches
# the db module, which throws on a missing DATABASE_URL, and the failure reads
# like a broken build rather than a missing file. That cost a definition-of-done
# check on 2026-09-03 before anyone noticed the cause.
#
# A copy rather than a hard link, and the difference matters: a session may
# legitimately want to point at a scratch database, and a hard link would make
# that edit reach the main checkout's env too - silently, with the live database
# on the other end. A copy is also genuinely disposable, so it goes when
# Remove-Session.ps1 takes the worktree with it.
#
# The cost of a copy is that it is a snapshot: rotate a key in the main folder and
# a live worktree keeps the old one. That is the right trade for a file that is
# hand-edited perhaps monthly, and the wrong one for the tracker - which is why
# the tracker is junctioned and this is not.
$envLocal = Join-Path $Main ".env.local"
$wtEnv    = Join-Path $Worktree ".env.local"
if (Test-Path $envLocal) {
  Copy-Item $envLocal $wtEnv -Force
  Write-Host "  copied .env.local  (a snapshot - re-copy it if you rotate a key)" -ForegroundColor DarkGray
} else {
  Write-Host "  no .env.local in $Main - 'npm run build' will fail here until there is one" -ForegroundColor Yellow
}

# 3b-ter. DATABASE_URL - REPLACED with a per-session Neon branch.
#
# The copied file carries whatever the main folder points at, and on 2026-09-11
# that was production: every worktree session had been running seeds, migrations
# and live tests against the real athlete data. GDPR decision 8 ended that - no
# branch is cut from production, and production is reached only by the Vercel
# production environment. So each session gets its own branch `dev/<Name>`, a
# copy-on-write child of the seeded schema-only template, with an expiry so a
# forgotten one dies on its own (the Free plan allows 10 branches per project).
# Remove-Session.ps1 deletes it eagerly.
#
# Fatal when it cannot be done, for the same reason a failed junction is fatal:
# a worktree that silently kept the production URL is worse than no worktree.
# Pass -DatabaseUrl to supply a branch by hand (offline, CLI not logged in).
$SessionBranch = "dev/$Name"
if (-not $DatabaseUrl) {
  if (-not (Get-Command neon -ErrorAction SilentlyContinue)) {
    throw "Neon CLI not found ('npm i -g neon', then 'neon login'). Or pass -DatabaseUrl <non-production url>."
  }
  $created = neon branches create --name $SessionBranch --parent $NeonParent --project-id $NeonProject --org-id $NeonOrg --no-secrets -o json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create Neon branch $SessionBranch (is 'neon login' done? is the 10-branch limit hit?):`n$created"
  }
  $expires = (Get-Date).ToUniversalTime().AddDays($BranchDays).ToString("yyyy-MM-ddTHH:mm:ssZ")
  neon branches set-expiration $SessionBranch --expires-at $expires --project-id $NeonProject --org-id $NeonOrg -o json 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "  could not set expiry on $SessionBranch - delete it by hand if the session is abandoned" -ForegroundColor Yellow }
  $DatabaseUrl = (neon connection-string $SessionBranch --pooled --project-id $NeonProject --org-id $NeonOrg 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $DatabaseUrl -notlike "postgresql://*") {
    throw "Could not read the connection string for ${SessionBranch}:`n$DatabaseUrl"
  }
  Write-Host "  neon branch $SessionBranch  <- $NeonParent, expires $expires" -ForegroundColor DarkGray
}
$envText = if (Test-Path $wtEnv) { [System.IO.File]::ReadAllText($wtEnv) } else { "" }
$envText = ($envText -split "`r?`n" | Where-Object { $_ -notmatch '^\s*DATABASE_URL=' }) -join "`n"
$envText = $envText.TrimEnd() + "`nDATABASE_URL=`"$DatabaseUrl`"`n"
[System.IO.File]::WriteAllText($wtEnv, $envText)
$shownUrl = ($DatabaseUrl -replace '://[^@]*@', '://<creds>@') -replace '\?.*$', ''
Write-Host "  DATABASE_URL -> $shownUrl" -ForegroundColor DarkGray

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
#    CONTEXT-BRIEF.md is the generated index of CONTEXT.md + OVERVIEW.md (both
#    gitignored, both in the main folder); importing the brief instead of the two
#    whole files is what keeps a session's opening context at ~6k tokens rather
#    than ~41k (2026-09-15). Rebuild it with scripts/context-brief.mjs.
$claudeMd = @"
@$MainFwd/AGENTS.md
@$MainFwd/CONTEXT-BRIEF.md
"@
# WriteAllText writes UTF-8 WITHOUT a BOM (Set-Content -Encoding utf8 would add one,
# and a leading BOM can break the first @-import).
[System.IO.File]::WriteAllText((Join-Path $Worktree "CLAUDE.md"), $claudeMd)

Write-Host ""
Write-Host "Session ready: $Worktree  (branch $Branch)" -ForegroundColor Green
Write-Host "The tracker is shared from $Docs - it is the same directory, not a copy."
Write-Host "Database: Neon branch $SessionBranch (seed data only - never production)."
Write-Host "Tear down with:  .\Remove-Session.ps1 -Name $Name"
