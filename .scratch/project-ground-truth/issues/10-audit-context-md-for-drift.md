# Audit CONTEXT.md for drift against the POC and tracker

Label: wayfinder:task
Status: done
Assignee: Mads (agent session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

Graduated from the map's last fog patch, now that [Rewrite OVERVIEW.md](02-rewrite-overview-as-real-front-door.md) and [Refresh the POC README](03-refresh-poc-readme-to-weekly-session-era.md) have established ground truth. CONTEXT.md is ~47KB of canonical domain language that evolved fast (Session Negotiation demoted, Weekly Session promoted, Coached Mode added). Audit every glossary entry against the POC code and the tracker:

1. **Stale entries** — terms describing behaviour the POC/product no longer has, or "current" claims that are now historical.
2. **Contradictions** — entries that conflict with each other or with an ADR after later decisions.
3. **Ghost terms** — vocabulary used in code/issues that the glossary never defines (the reverse drift).
4. Classify each finding: fix inline (typo-grade), needs a decision (flag, don't fix), or fine as aspirational spec (CONTEXT.md legitimately describes unbuilt product — V1/V2 entries are not drift).

The README ticket's resolution lists what the POC actually demonstrates — use it as the code-side baseline. Sized for a full fresh session; don't take this one with a tired context. Resolution: a findings table (entry → verdict → action), inline fixes applied, decision-needing items listed for Mads.

## Resolution

Done 2026-07-08. Every glossary entry audited against the POC code baseline (the [README ticket's resolution](03-refresh-poc-readme-to-weekly-session-era.md)), all three ADRs, the tracker's feature directories, and `.scratch/mvp/gdpr-decisions.md`. The bulk of the file is healthy: the Coached Mode / Head Coach cluster matches ADR 0003, the draggable-calendar cluster matches ADR 0002 (unbuilt spec — legitimately aspirational, all its issues are `ready-for-agent`), the Weekly Session model matches the shipped POC, and Session Type colours match `calendar.js`.

### Findings table

| Entry | Verdict | Action |
|---|---|---|
| *(missing)* **View** | **Textual corruption** — the View definition was swallowed by Session Drawer's `_Avoid_` line ("side panel that switches based on the selected nav destination…"); predates git (present in baseline `4ae934a`) | Fixed inline: **View** entry restored between Navigation Drawer and Session Drawer, now naming the POC's actual views (Coach, Training Plan, Equipment, Glossary, Settings, Privacy & Terms); `_Avoid_` line trimmed |
| **Coach** | Stale — "drives Session Negotiation" is daily-negotiation-era phrasing | Fixed inline: Weekly Session named as primary loop, Session Negotiation as exception-triggered |
| **Week Plan** | Contradiction — "skipped via Session Negotiation" vs Session Negotiation's own "distinct from a skip" | Fixed inline: skip decoupled from negotiation; Session Move added as a modification path |
| **Planned Session** | Stale — "becomes a real session only once the athlete enters Session Negotiation on that day" | Fixed inline: proposal → training record on completion/skip; content change = Session Negotiation |
| **Training Plan** | Contradiction — inline day expansion vs Session Drawer's "replaces the former inline calendar expansion — exactly one place session detail lives" | Fixed inline: detail now reached via Expanded Week → Session Block → Session Drawer (the decided spec; POC still demonstrates the predecessor until draggable-calendar lands) |
| **Session Reflection**, **Session Feedback Prompt** | Same contradiction — "editing by expanding the session day" | Fixed inline: edits happen via the Session Drawer |
| **Privacy Proxy** | Contradiction — "In MVP, free-text never reaches external LLMs" vs gdpr-decisions.md (Privacy Proxy is V2; POC/MVP sends Coach Chat free-text and comments behind a privacy notice, pending review) and vs Coach Chat's own open-question note | Fixed inline: repositioned as V2 layer with the MVP reality stated, citing gdpr-decisions.md — **flagged below for Mads's confirmation** |
| **Onboarding Session** | Stale — "MCQ field set to be defined (deferred)" — mcq-onboarding shipped | Fixed inline: deferred sentence dropped; field list extended with Fixed Constraints and Weekly Session Day (per mcq-onboarding issue 03) |
| **Athlete Language** | Stale — "Changeable via Settings in V1+, not in MVP/POC" — the POC Settings view has an English/Dansk switcher | Fixed inline: changeable in Settings |
| **Fixed Constraint** | Ghost term — shipped feature (coach-constraint-memory, done), referenced by Session Move entry, never defined | Entry added (Data Concepts) |
| **Unavailable** | Ghost term — used in two senses (unavailable *date*, constraint memory; unavailable *session*, Displacement limbo), never defined | Entry added documenting both granularities and the distinction from skip |
| **Weekly Session Day** | Ghost term — shipped feature (weekly-session-date, done), never defined | Entry added after Weekly Session |
| **Session Feedback** | Ghost term — load-bearing in Weekly Session, Check-in, metrics entries and in code (`bh_session_feedback`), never defined | Entry added (Data Concepts): the data a Session Reflection captures |
| **Trajectory Projection** (+ its mentions in Achievement Motivation, Experience-Adaptive UX, Coach) | Ambiguous — removed from the POC with the Session Negotiation cleanup, but no product-level decision retires it | **Not fixed — decision needed** (below) |
| **Pushback Rationale** | Fine as aspirational — the POC's log UI was deleted, but the term survives as product spec (Move Checkpoint comment, Coach Briefing synthesis) | None |
| Coached Mode cluster, draggable-calendar cluster, Knowledge Oracle, Monthly Review Session, Roster View, Coach Briefing, Presence Arc, Session Type, remaining entries | Fine — aspirational V1/V2 spec or verified against POC/ADRs | None |

### Adjacent truth fix (same spirit as ticket 03's)

`.scratch/mvp/gdpr-decisions.md` still described Session Feedback as "emoji ratings (1–5)" — terminology updated to the shipped RPE 1–10 scale (decisions unchanged; Last-updated line notes the edit).

### Decision-needing items for Mads

1. **Trajectory Projection — keep or retire?** The POC feature ("Where am I headed?" button) was deleted with Session Negotiation on 2026-06-26, but the glossary still carries it as a Knowledge-Oracle-backed product concept, referenced by three other entries. If it's retired, four entries need editing; if it's V1+ aspiration, it's fine as-is. No recorded decision either way today.
2. **Bodily Information page** — nav-training-plan issue 09 names an athlete-facing surface the glossary doesn't define; its content is explicitly pending the reference-app review. When that review happens, decide the domain name and add the entry — nothing to write until then.
3. **Confirm the softened Privacy Proxy language.** The old entry promised "free-text never reaches external LLMs in MVP"; the recorded GDPR decisions (notice-gated free text now, Privacy Proxy at V2) say otherwise, so the glossary was aligned to the decision record — but this weakens a privacy commitment and deserves Mads's explicit eyes.
