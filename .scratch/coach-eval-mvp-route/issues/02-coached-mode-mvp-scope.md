Label: wayfinder:grilling
Status: ready-for-human
Assignee: Claude + Mads (grill session 2026-07-16, queued after ticket 03)

# Scope Coached Mode for the eval-MVP

## Question

[ADR 0003](../../../docs/adr/0003-coached-mode-authority.md) designs the whole Coached Mode surface, but it was scoped for V1 with a real roster. Given the eval has **one real athlete (Mads) + an optional synthetic roster**, which parts does the eval-MVP actually build, and which defer?

Decide, one at a time:

- **Roster View** — in? With one real athlete + synthetic roster, is it worth building the list surface, or is a single-athlete coach view enough to evaluate the experience?
- **Synthetic roster** — in or out for the eval (the "maybe" from the destination grill)? If in, how many, and do they reuse the four personas + synthetic Information View data?
- **Prescribed Sessions + three-tier authority** (Head Coach > AI Coach on content; AI only *suggests*; athlete keeps placement + reality; completed immutable) — full model, or a trimmed version for the eval?
- **Coach Briefing** (per-athlete interrogable AI channel for the coach) — in?
- **Narration with attribution** (AI Coach tells the athlete about every Head Coach action; no silent plan mutations) — in? This is core to the trust story, likely non-negotiable.
- **Coaching Link** — a real single-use invite flow, or a seeded link between two known accounts for the eval?

Output: the feature scope the server data model and build sequence hang on. Respect the standing scope principle — trim for the eval, but don't design a coach surface the full-product roster can't grow into.

## Blocked by

None — destination + athlete scope are enough to decide feature scope. Independent of the architecture/stack chain.
