# Decide the project folder's name

Label: wayfinder:grilling
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

The folder is `C:\Users\madsk\Trader-proj` but the project is the Biohacking Coach App — the single most misleading fact in the workspace. Grill Mads (HITL) to a recorded decision:

- Why is it named Trader-proj — historical accident, or is there context an agent can't see?
- Rename, alias, or keep-and-document? Costs of renaming: Claude project memory and session keying live under a path derived from `C--Users-madsk-Trader-proj`; a rename orphans that until reconfigured. Cost of keeping: every future cold session starts with the wrong mental model unless OVERVIEW.md (ticket 02) inoculates it.
- If keep: is a one-line "yes, the folder name is wrong, this is the Biohacking Coach App" notice at the top of OVERVIEW.md enough?

Scope guard: execution of a rename is **out of scope** for this map (see map). This ticket produces the decision only.

## Resolution

Decided by Mads, 2026-07-08: **rename soon — intent recorded, execution deferred.** The folder will move to a truthful name (suggested: `biohacking-coach`), but not as part of this map: the rename needs its own session because Claude's project memory and session keying derive from the current path (`C--Users-madsk-Trader-proj`) and must be migrated or reconfigured alongside the move. No rationale for the original name was offered — treated as historical accident.

Until the rename happens, the warning blockquote in [OVERVIEW.md](../../../OVERVIEW.md) remains the corrective for cold readers; it has been updated to state the decided intent rather than an open question.
