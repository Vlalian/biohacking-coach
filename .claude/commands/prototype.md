---
description: Build a throwaway prototype to flesh out a design before committing to it. Routes between two branches — a runnable terminal app for state/business-logic questions, or several radically different UI variations toggleable from one route. Use when the user wants to prototype, sanity-check a data model or state machine, mock up a UI, explore design options, or says "prototype this", "let me play with it", "try a few designs".
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

- **"Does this logic / state model feel right?"** → Build a tiny interactive terminal app that pushes the state machine through hard-to-reason-about cases. (See `.agents/skills/prototype/LOGIC.md`)
- **"What should this look like?"** → Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar. (See `.agents/skills/prototype/UI.md`)

If the question is ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (backend module → logic; page or component → UI) and state the assumption.

## Rules

1. **Throwaway from day one, and clearly marked as such.** Locate prototype code close to where it will actually be used. Name it so a casual reader knows it's a prototype.
2. **One command to run.** Use the project's existing task runner.
3. **No persistence by default.** State lives in memory.
4. **Skip the polish.** No tests, no error handling beyond runnable, no abstractions.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state.
6. **Delete or absorb when done.** Either delete it or fold the validated decision into real code.

## When done

The _answer_ is the only thing worth keeping. Capture it somewhere durable (commit message, ADR, issue, or a `NOTES.md` next to the prototype) along with the question it was answering.
