# Rule on the drift audit's flagged glossary decisions

Label: wayfinder:grilling
Status: done
Assignee: Mads (agent session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

The [CONTEXT.md drift audit](10-audit-context-md-for-drift.md) fixed everything it could against recorded decisions, but two items need Mads's ruling — both quick HITL calls, one short grilling session:

1. **Trajectory Projection — keep or retire?** The POC feature was deleted with Session Negotiation (2026-06-26), but no product-level decision retires the concept. The glossary still defines it (Knowledge-Oracle-backed motivational projection) and three other entries reference it (Coach, Achievement Motivation, Experience-Adaptive UX). If retired: edit four entries. If V1+ aspiration: no change, optionally tag it V1.

2. **Confirm the softened Privacy Proxy language.** The audit aligned the glossary to `.scratch/mvp/gdpr-decisions.md`: Privacy Proxy is now stated as a V2 layer, and the MVP is described as sending athlete free-text (Coach Chat, comments) to the hosted LLM behind a privacy notice pending GDPR review — replacing the old, stronger claim that "free-text never reaches external LLMs in MVP". Confirm this is the intended product posture, or re-commit to the stronger claim (which would mean revisiting the GDPR decisions doc, not just the glossary).

(Not in this ticket: the **Bodily Information page** ghost term — its content is pending the out-of-band reference-app review recorded in nav-training-plan issue 09; nothing to decide until that happens.)

## Resolution

Ruled by Mads live in session, 2026-07-08.

1. **Trajectory Projection: keep, tagged V1.** The concept survives as future product spec, now explicitly marked "V1 feature; not in MVP scope" in its glossary entry (with a note that the POC's early version was retired with Session Negotiation on 2026-06-26). The three referencing entries — Coach, Achievement Motivation, Experience-Adaptive UX — stand untouched.

2. **Privacy Proxy: softened language confirmed.** The glossary's alignment to `.scratch/mvp/gdpr-decisions.md` is the intended product posture — notice-gated athlete free-text reaches the hosted LLM in MVP pending GDPR review, and the Privacy Proxy is a V2 layer. The old "free-text never reaches external LLMs in MVP" claim was never the decided position. No further edits.
