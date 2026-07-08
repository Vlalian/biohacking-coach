---
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Domain awareness

Look for existing documentation: `CONTEXT.md` at the root, and `docs/adr/` for architectural decisions.

## During the session

**Challenge against the glossary** — when the user uses a term conflicting with `CONTEXT.md`, call it out: "Your glossary defines 'X' as Y, but you seem to mean Z — which is it?"

**Sharpen fuzzy language** — when the user uses vague terms, propose a precise canonical term.

**Discuss concrete scenarios** — stress-test domain relationships with specific edge-case scenarios.

**Cross-reference with code** — when the user states how something works, verify against the codebase. Surface contradictions.

**Update CONTEXT.md inline** — when a term is resolved, update `CONTEXT.md` right there. Don't batch. Use this format:

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Term**:
{One or two sentence definition. What it IS, not what it does.}
_Avoid_: synonym1, synonym2
```

Rules: be opinionated (pick one term, list others under _Avoid_), keep definitions tight, only include terms specific to this project's context.

**Offer ADRs sparingly** — only when ALL three are true:
1. Hard to reverse
2. Surprising without context
3. Result of a real trade-off

ADR format — save to `docs/adr/NNNN-slug.md`:
```md
# {Short title of the decision}

{1-3 sentences: context, decision, why.}
```
Optional sections: Status frontmatter, Considered Options, Consequences — only when they add genuine value.
