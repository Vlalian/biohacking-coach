---
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

Issue tracker: local markdown files in `.scratch/`. Issues live at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (path), read its full body.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so. Use the project's domain glossary vocabulary.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice cutting through ALL integration layers end-to-end — NOT a horizontal slice of one layer.

Slices may be 'HITL' (requires human interaction) or 'AFK' (can be implemented without human interaction). Prefer AFK over HITL where possible.

Rules:
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:
- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices must complete first
- **User stories covered**: which user stories this addresses

Ask: Does the granularity feel right? Are dependencies correct? Should any slices be merged or split?

Iterate until the user approves the breakdown.

### 5. Publish issues

For each approved slice, create `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. Publish in dependency order (blockers first). Set `Status: ready-for-agent` at the top of each file.

## Issue Template

```
Status: ready-for-agent

# <NN> — {Title}

## Parent

`.scratch/<feature-slug>/PRD.md`

## What to build

A concise description of this vertical slice. Describe end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale. Exception: prototype snippets encoding decisions more precisely than prose can.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

None — can start immediately.

(Or: reference to blocking issue path)
```

Do NOT close or modify any parent issue.
