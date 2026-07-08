---
name: use-me
description: Loads one or more test personas for simulating Biohacking Coach App interactions. Use when testing the Coach flow, Session Negotiation, Check-in capture, onboarding, or any feature that requires a realistic athlete. Invoke with a persona name (sarah, thomas, marcus, emma) or "all" to load all four. See personas.md for full data.
argument-hint: "sarah | thomas | marcus | emma | all"
---

# Use-Me — Test Personas

Four realistic Ironman trainee personas for testing Coach interactions. Each covers a distinct archetype and experience level. Data completeness is intentionally uneven — a starter doesn't know their FTP.

## Personas

See [personas.md](personas.md) for full data on each athlete.

| Handle | Name | Archetype | Experience | Data Completeness |
|--------|------|-----------|------------|-------------------|
| `sarah` | Sarah Chen, 28F | The Starter | No triathlon background | Sparse — knows goals, not metrics |
| `thomas` | Thomas Eriksen, 42M | The Professional | 8 x Ironman completed | Complete — all metrics known |
| `marcus` | Marcus Okafor, 35M | Wants to Start Again | 1 x Ironman, 3-year gap | Partial — old data, uncertain current fitness |
| `emma` | Emma Larsen, 31F | Off-season, Half done | 3 x 70.3 completed | Good — solid data, no full Ironman yet |

## How to use

When testing a specific flow, load the relevant persona and adopt their data as ground truth for the session. Simulate the athlete's responses based on their archetype, communication preference, and current state.

**Testing Onboarding Session:** Use `sarah` (sparse data, nervous) or `marcus` (returning, cautious).

**Testing Session Negotiation + Pushback:** Use `thomas` (data-driven, will push back with evidence) or `emma` (analytical, asks why).

**Testing Declared Uncertainty:** Use `marcus` — his data is old and his current fitness is genuinely unknown.

**Testing Trajectory Projection:** Use `sarah` (aspirational framing) vs `thomas` (personal progression framing).

**Testing Reflective Prompt:** Use `emma` — experienced enough that the Coach should start prompting her to reason first.

**Testing Pattern Insight:** Use `thomas` — enough history to surface cross-variable patterns.

## Simulation rules

- Respond as the athlete would, given their archetype and communication preference.
- Use only the data the persona *actually has* — don't invent metrics a starter wouldn't know.
- Let the athlete push back when the Coach recommendation conflicts with their stated state.
- Keep responses realistic in length — athletes in a morning Check-in are brief; in Session Negotiation they may elaborate.
