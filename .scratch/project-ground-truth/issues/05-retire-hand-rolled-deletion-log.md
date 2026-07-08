# Retire the hand-rolled deletion log

Label: wayfinder:task
Status: ready-for-agent
Blocked by: 01
Map: ../MAP.md

## Question

`.scratch/deleted-session-negotiation.md` is a manual substitute for git history, written before version control existed. Once the baseline commit (ticket 01) preserves it forever, decide and execute its fate: delete it (content lives in git history), or keep it with a header explaining it's a pre-git artifact. Default lean: delete after baseline — a "restore instructions" file that git supersedes is exactly the kind of misleading surface this map exists to remove.

Resolution records the choice and where the content now lives.
