# Retire the hand-rolled deletion log

Label: wayfinder:task
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: 01
Map: ../MAP.md

## Question

`.scratch/deleted-session-negotiation.md` is a manual substitute for git history, written before version control existed. Once the baseline commit (ticket 01) preserves it forever, decide and execute its fate: delete it (content lives in git history), or keep it with a header explaining it's a pre-git artifact. Default lean: delete after baseline — a "restore instructions" file that git supersedes is exactly the kind of misleading surface this map exists to remove.

Resolution records the choice and where the content now lives.

## Resolution

Done 2026-07-08. **Deleted.** The file's full content is permanently preserved in the baseline commit `4ae934a` at path `.scratch/deleted-session-negotiation.md`; recover it any time with:

```
git show 4ae934a:.scratch/deleted-session-negotiation.md
```

The removed Session Negotiation code blocks it documented are likewise recoverable from that commit's `poc/` tree. A keep-with-header option was considered and rejected: the file's only job was manual restore instructions, which git history now does strictly better, and a lingering "how to restore Session Negotiation" file misleads readers into thinking restoration is planned.
