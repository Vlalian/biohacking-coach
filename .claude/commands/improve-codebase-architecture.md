---
description: Find deepening opportunities in a codebase, informed by the domain language in CONTEXT.md and the decisions in docs/adr/. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and AI-navigable.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. Aim: testability and AI-navigability.

Full language reference: `.agents/skills/improve-codebase-architecture/LANGUAGE.md`

## Key vocabulary

- **Module** — anything with an interface and an implementation
- **Interface** — everything a caller must know to use the module
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface
- **Seam** — where an interface lives; where behaviour can be altered without editing in place
- **Deletion test** — imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **One adapter = hypothetical seam. Two adapters = real seam.**

## Process

### 1. Explore

Read `CONTEXT.md` and any `docs/adr/` files first. Then explore the codebase organically, noting friction:
- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where are pure functions extracted just for testability, but real bugs hide in how they're called?
- Which parts are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory (`%TEMP%\architecture-review-<timestamp>.html`). Open it with `start <path>`.

Use Tailwind via CDN for layout, Mermaid via CDN for diagrams. Each candidate gets a card:
- **Files** — which modules are involved
- **Problem** — why the current architecture causes friction
- **Solution** — plain English description of what would change
- **Benefits** — in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, illustrating the shallowness and deepening
- **Recommendation strength** — `Strong` | `Worth exploring` | `Speculative`

End with a **Top recommendation** section.

Use `CONTEXT.md` vocabulary for domain, `.agents/skills/improve-codebase-architecture/LANGUAGE.md` for architecture.

See `.agents/skills/improve-codebase-architecture/HTML-REPORT.md` for full HTML scaffold.

Do NOT propose interfaces yet. After writing, ask: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree — constraints, dependencies, the shape of the deepened module, what tests survive.

Side effects inline as decisions crystallize:
- **New concept not in `CONTEXT.md`?** Add the term (see `/grill-with-docs` format)
- **User rejects candidate with load-bearing reason?** Offer an ADR
- **Exploring alternative interfaces?** See `.agents/skills/improve-codebase-architecture/INTERFACE-DESIGN.md`
