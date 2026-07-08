---
description: Loads one or more test personas for simulating Biohacking Coach App interactions. Use when testing the Coach flow, Session Negotiation, Check-in capture, onboarding, or any feature that requires a realistic athlete. Invoke with a persona name (sarah, thomas, marcus, emma) or "all" to load all four.
argument-hint: "sarah | thomas | marcus | emma | all"
---

# Use-Me — Test Personas

Four realistic Ironman trainee personas for testing Coach interactions.

| Handle | Name | Archetype | Experience | Data Completeness |
|--------|------|-----------|------------|-------------------|
| `sarah` | Sarah Chen, 28F | The Starter | No triathlon background | Sparse |
| `thomas` | Thomas Eriksen, 42M | The Professional | 8 x Ironman completed | Complete |
| `marcus` | Marcus Okafor, 35M | Wants to Start Again | 1 x Ironman, 3-year gap | Partial |
| `emma` | Emma Larsen, 31F | Off-season, Half done | 3 x 70.3 completed | Good |

Full persona data: `.agents/skills/use-me/personas.md`

## When to use which persona

- **Testing Onboarding:** `sarah` (sparse data, nervous) or `marcus` (returning, cautious)
- **Testing Session Negotiation + Pushback:** `thomas` (data-driven, will push back with evidence) or `emma` (analytical, asks why)
- **Testing Declared Uncertainty:** `marcus` — his data is old and genuinely unknown
- **Testing Trajectory Projection:** `sarah` (aspirational) vs `thomas` (personal progression)
- **Testing Reflective Prompt:** `emma` — experienced enough to reason first
- **Testing Pattern Insight:** `thomas` — enough history for cross-variable patterns

## Simulation rules

- Respond as the athlete would, given their archetype and communication preference
- Use only the data the persona *actually has* — don't invent metrics a starter wouldn't know
- Let the athlete push back when Coach recommendation conflicts with their stated state
- Keep responses realistic in length — athletes in morning Check-in are brief; in Session Negotiation they may elaborate

## Quick reference: Sarah Chen (The Starter)
28F, Copenhagen. No triathlon background. Race: Ironman Copenhagen, August 2027. Sparse data — knows goals, not metrics. Needs encouragement. Anxious with too much data or jargon.

## Quick reference: Thomas Eriksen (The Professional)
42M, Aarhus. 8 x Ironman. Race: Ironman Frankfurt, July 2026 (5 weeks away). FTP 285W, swim CSS 1:27, run threshold 4:08/km. Data-first, direct. Will push back with evidence.

## Quick reference: Marcus Okafor (Wants to Start Again)
35M, Oslo. 1 x Ironman (12:34), 3-year gap due to burnout + IT band injury. Race: considering Barcelona 2027. Estimates FTP ~210-220W (unverified). Cautious, afraid of re-injury.

## Quick reference: Emma Larsen (Off-season, Half Ironman)
31F, Malmö. 3 x 70.3, considering full Ironman. FTP 215W, run threshold 5:05/km. Analytical, asks "why" frequently. Trains best evenings. Off-season maintenance phase.
