Label: wayfinder:grilling
Status: ready-for-human

# Reconcile the schema's column names with the glossary

Map: ../MAP.md

## Question

[CONTEXT.md](../../../CONTEXT.md) opens with a rule:

> Use these terms exactly in issues, PRDs, code, and agent prompts. Do not drift to synonyms.

[Ticket 05](05-server-data-model.md)'s signed-off `athlete` columns drift from it. Surfaced by a standards review of slice 01 (2026-07-16), which built them as written.

The one that actually misleads:

- **`weekly_session_count`** — means *training sessions per week*. But **Weekly Session** is the once-per-week Coach ritual (Check-in → Review → Planning). So the name reads as "how many Weekly Sessions", which is always one. It says the opposite of what it holds. A future agent reading the schema cold will get this wrong, and `CONTEXT.md` is precisely what is supposed to stop that.

The rest are abbreviations of canonical terms rather than contradictions:

- **`phase`** → the glossary term is **Training Phase**
- **`comm_style`** → **Communication Style**
- **`info_layout`** → holds the Information View's **Favorites**, order, and range

## What to decide

1. **Is `weekly_session_count` renamed?** It is the one that actively misleads. `sessions_per_week` or `training_sessions_per_week` says what it holds. Recommended.
2. **Are the abbreviations worth renaming?** `phase` and `comm_style` are unambiguous *in context* and the glossary rule is about drifting to synonyms, not about forbidding short forms. There is a real argument for leaving them: `training_phase` and `communication_style` are longer for no gain, and churn on a signed-off schema has its own cost. The counter-argument is that "unambiguous in context" is exactly what a cold agent lacks.
3. **If nothing is renamed**, ticket 05 should say why — an explicit "these short forms are intentional" note stops the next reviewer refiling this.

## Why now

Slice 01 built one table with one migration. Slice 04 brings `sessions`, and from there ten more tables key off these names, plus Drizzle types, queries, and components. Renaming today is one migration and one schema file. Renaming after slice 11 is a refactor across the whole build.

This is a decision about a signed-off artifact, so it is Mads's, not an agent's — [ticket 05](05-server-data-model.md) was signed off column-for-column and an agent should not quietly rewrite it.

## Blocked by

None. Best resolved before [slice 04](../../eval-mvp-build/issues/04-calendar-renders-real-sessions.md) lands `sessions`.
