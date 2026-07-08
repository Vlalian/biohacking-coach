---
description: Teach the user a new skill or concept, within this workspace.
argument-hint: "What would you like to learn about?"
---

The user has asked you to teach them something. This is a stateful request — they intend to learn the topic over multiple sessions.

Full teaching philosophy and file formats: `.agents/skills/teach/`

## Teaching Workspace Files

- `MISSION.md` — why the user is interested in the topic. Ground all teaching in this.
- `./reference/*.html` — compressed learnings, cheat sheets, designed for quick reference.
- `RESOURCES.md` — resources for grounding teaching in contextual knowledge.
- `./learning-records/*.md` — what the user has learned. Format: `0001-<dash-case-name>.md`. Use to calculate zone of proximal development.
- `./lessons/*.html` — one self-contained HTML file per lesson. Format: `0001-<dash-case-name>.html`.
- `NOTES.md` — user preferences and working notes.

## Process

1. **Understand the mission first.** If `MISSION.md` doesn't exist or is unclear, ask the user why they want to learn this before doing anything else. Failing to understand the mission means lessons feel abstract.

2. **Find their zone of proximal development.** Read `learning-records/`, figure out what they already know, teach the most relevant thing that challenges them *just enough*. If they tell you they already know a topic, record it in `learning-records/`.

3. **Gather knowledge from trusted resources.** Never trust parametric knowledge alone. Use `RESOURCES.md` to track high-quality sources. Populate it before teaching if empty.

4. **Produce a lesson.** Each lesson is one self-contained HTML file saved to `./lessons/`. Teach ONE THING only. Beautiful typography. Completable quickly. Tied to the mission. Linked to other lessons and reference docs. Include a reminder to ask the agent follow-up questions.

5. **Create reference documents alongside lessons.** Glossaries are essential. Cheat sheets for syntax, algorithms, sequences.

## Philosophy

Users need three things:
- **Knowledge** — from high-quality, high-trust resources
- **Skills** — acquired through interactive lessons
- **Wisdom** — comes from real-world community interaction (find high-reputation communities to recommend)
