---
description: Turn the current conversation context into a PRD and publish it to the project issue tracker. Use when user wants to create a PRD from the current context.
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

Issue tracker: local markdown files in `.scratch/`. PRD lives at `.scratch/<feature-slug>/PRD.md`.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can.

   Check with the user that these seams match their expectations.

3. Write the PRD using the template below, then publish it to `.scratch/<feature-slug>/PRD.md`. Set `Status: ready-for-agent` at the top.

## PRD Template

```
Status: ready-for-agent

# PRD — {Feature Name}

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A numbered list of user stories:

1. As an <actor>, I want a <feature>, so that <benefit>

## Implementation Decisions

A list of implementation decisions:
- The modules that will be built/modified
- Interface changes
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets (they go stale). Exception: prototype snippets that encode a decision more precisely than prose can.

## Testing Decisions

- What makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests

## Out of Scope

Things that are explicitly out of scope for this PRD.

## Further Notes

Any further notes about the feature.
```
