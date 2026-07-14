# How to Structure a Codebase — Maintainable, Cost-Effective, Performance-Oriented

Research notes, 2026-07-14. Grounded in primary sources (original books, papers, and official docs); every section cites where the idea comes from. Written for a learning developer: jargon is explained the first time it appears.

---

## The Playbook (do this in practice)

A condensed recipe. Each rule is unpacked, with sources, in the sections below.

1. **Organize folders by feature, not by technical layer.** Prefer `src/features/check-in/` (containing its UI, logic, and data access) over `src/controllers/`, `src/services/`, `src/models/`. A change to one feature should touch one folder.
2. **Keep a pure core, push I/O to the edges.** Put calculations and business rules in modules that take plain data in and return plain data out — no database calls, no HTTP, no file reads inside them. Wrap the messy outside world (DB, APIs, UI) in thin "adapter" files that call into the core. This one habit buys you testability, easy change, and fast hot paths all at once.
3. **Make each module deep: small surface, big work.** A module (a file or folder with one job) should expose a few simple functions but do a meaningful amount of work behind them. If a file is just a thin pass-through wrapper, inline it; if a file's interface needs a paragraph to explain, redesign it.
4. **Let dependencies flow one way — toward the core.** Feature folders may import from `core/` (or `domain/`); `core/` never imports from features, UI, or the database layer. No import cycles, ever.
5. **Enforce boundaries with tools, not discipline.** Add `dependency-cruiser` (or ESLint import rules) to CI with rules like "no circular dependencies" and "core must not import from adapters". Rules that aren't checked by a machine erode.
6. **Split files by responsibility, not by line count.** A 400-line file with one cohesive job is fine; a 100-line file mixing validation, formatting, and fetching is not. Split when a file has two reasons to change, when you scroll to find things, or when tests need unrelated setup.
7. **Colocate tests with the code they test.** `calc-load.ts` next to `calc-load.test.ts`. Moving a feature moves its tests; deleting a feature deletes them.
8. **Skip barrel files** (an `index.ts` that just re-exports everything in a folder) except at deliberate package boundaries. Import the specific file you need.
9. **Build the simplest thing that works now (YAGNI), but keep it easy to change.** Don't add configuration options, abstraction layers, or "we might need this" generality. Do keep code clean and well-factored — that's what makes adding the feature later cheap.
10. **Never optimize on a guess.** Get it correct and well-structured first, measure with a profiler, then optimize only the measured hot spot — which your structure has conveniently isolated in the pure core.

---

## 1. Information hiding — Parnas (1972)

**Source:** D.L. Parnas, "On the Criteria To Be Used in Decomposing Systems into Modules," *Communications of the ACM*, 1972. Full text: https://wstomv.win.tue.nl/edu/2ip30/references/criteria_for_modularization.pdf (ACM record: https://dl.acm.org/doi/10.1145/361598.361623)

**What it says.** The founding paper of modular design. Parnas compares two ways of cutting a program into modules: (a) by the steps of the processing flow (step 1 module, step 2 module...), and (b) by *design decisions* — each module hides one decision that is likely to change (a data format, an algorithm choice, a device detail). He shows the second decomposition is dramatically easier to change, because "every module ... is characterized by its knowledge of a design decision which it hides from all others." Decompose by what might change, not by the order things happen.

**Why it lowers cost of change.** If the choice of, say, how sessions are stored is known only inside one module, switching storage rewrites one module. If that knowledge leaks (other files know the JSON shape, the file path, the SQL), every leak site is a change site. Information hiding converts "change ripples everywhere" into "change stays home." Parnas also claims (and 50 years of practice confirm) independent development and easier comprehension: you can work on one module without memorizing the rest.

**In TypeScript.**
- Export the *operation*, not the *representation*: `getWeekPlan(athleteId)` rather than exporting the raw table row type and letting callers assemble it.
- Use `export` deliberately — everything not exported is hidden. A module's `index` of exported names *is* its interface.
- Keep types that describe internal storage (`DbSessionRow`) unexported; expose a domain type (`Session`) and convert at the boundary.

## 2. Deep modules vs shallow modules — Ousterhout

**Source:** John Ousterhout, *A Philosophy of Software Design* (2nd ed., 2021). Book page: https://web.stanford.edu/~ouster/cgi-bin/book.php — interface/depth ideas also stated by Ousterhout directly in this interview: https://newsletter.pragmaticengineer.com/p/the-philosophy-of-software-design

**What it says.** Ousterhout's central claim: complexity is the enemy, and the main weapon is the *deep module* — a module whose interface (what callers must know) is much smaller than its functionality (what it does). Think of a rectangle: interface is the width, implementation is the depth. Best case: narrow and deep, like Unix file I/O (five simple calls hiding an enormous filesystem). Worst case: *shallow* modules — wide interface, little behind it — such as a class per tiny operation, or a wrapper function that just forwards to another function. Shallow modules add interface (cost) without hiding complexity (benefit).

**Why it lowers cost of change.** Everything a caller can see is something you can never freely change. A small interface means most of the module is invisible, so most of it can be rewritten without touching callers. Deep modules also cut the *reading* cost: users learn five functions, not fifty.

**In TypeScript.**
- Prefer one module exporting `planWeek(profile, history): WeekPlan` over five exported helpers callers must call in the right order. Pull the orchestration *inside*.
- Red flags: a file whose exports are mostly one-line wrappers; a function whose parameter list restates the caller's whole context; "manager"/"util" files that accumulate unrelated exports.
- It's fine — good, even — for a deep module's *implementation* to be several private files in a folder, as long as the folder exposes one small entry point.

## 3. High cohesion, low coupling

**Source:** W. Stevens, G. Myers, L. Constantine, "Structured Design," *IBM Systems Journal* 13(2), 1974 — the paper that coined both terms: https://ieeexplore.ieee.org/document/5388187 . The same idea underlies Parnas (above) and Ousterhout (above).

**What it says.** *Cohesion* = how strongly the pieces inside one module belong together. *Coupling* = how much modules depend on each other's internals. Good structure maximizes cohesion inside a module and minimizes coupling between modules. The worst coupling is when module A depends on *how* module B works (its data layout, its call order) rather than just *what* it promises.

**Why it lowers cost of change.** Change cost is roughly "number of modules a change touches × how hard each is to understand." High cohesion keeps a change inside one module; low coupling stops it spreading.

**In TypeScript.**
- Pass values, not half-built objects that the callee must know how to finish.
- If two files constantly import each other's internals, they're one module wearing two file names — merge them or redraw the line.
- Watch for "temporal coupling": functions that only work if called in a specific order. Fold the sequence into one function.

## 4. Feature folders and vertical slices (vs layer folders)

**Sources:** Jimmy Bogard, "Vertical Slice Architecture": https://www.jimmybogard.com/vertical-slice-architecture/ ; the cohesion/coupling rationale above; Parnas's change-driven criterion.

**What it says.** A *layered* folder layout groups code by technical kind (`controllers/`, `services/`, `repositories/`). A *feature* (vertical-slice) layout groups code by capability (`features/onboarding/`, `features/weekly-plan/`), each slice containing whatever UI, logic, and data access it needs. Bogard's rule of thumb: minimize coupling **between** slices, maximize coupling **within** a slice — and note that with slices, "new features only add code" instead of editing shared layer files. This is Parnas applied to folders: features change together, layers don't.

**Why it lowers cost of change.** Requests never arrive as "change all the controllers"; they arrive as "change how check-ins work." With feature folders that request maps to one directory: small diffs, easy review, safe deletion (remove the folder, the feature is gone). Layered layouts smear every feature across the whole tree, so every change is a multi-folder scavenger hunt and every shared layer file is a merge-conflict magnet.

**In TypeScript.**
- Layout sketch:
  ```
  src/
    core/            # pure domain logic + types (no I/O)
    features/
      onboarding/    # route/UI + feature logic + its tests
      weekly-plan/
    adapters/        # db client, external APIs, LLM client
    app/             # wiring: routes, composition, config
  ```
- Shared code must *earn* its way out of a feature: extract to `core/` or a shared module only when a second real user appears (see YAGNI, §8).
- Slices may use different levels of sophistication — a simple feature can stay a plain script while a complex one grows structure. Consistency of *boundaries* matters more than consistency of *internals*.

## 5. Hexagonal architecture (ports and adapters) — dependency direction toward the core

**Sources:** Alistair Cockburn, "Hexagonal Architecture": https://alistair.cockburn.us/hexagonal-architecture/ ; Robert C. Martin, "The Clean Architecture" (2012): https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html

**What it says.** Cockburn's pattern: keep the application core free of knowledge about the outside world. The core talks through *ports* (interfaces describing a purpose: "store sessions," "notify athlete"), and *adapters* translate between each port and a concrete technology (Postgres, a REST call, a test fake). His key line: the asymmetry that matters is inside vs. outside — code belonging to the inside must not leak out. Martin's Clean Architecture generalizes it as the **Dependency Rule**: source-code dependencies point only inward, toward business rules; the database, the web framework, and the UI are outer-ring "details." Result, in Martin's words: business rules testable "without the UI, Database, Web Server, or any other external element."

**Why it lowers cost of change (and cost, period).** The volatile stuff — frameworks, vendors, APIs, LLM providers — lives in adapters you can swap without touching the core. Tests of business logic run in milliseconds with fakes instead of minutes with a database, which is a direct, recurring cost saving (CI time, debugging time, courage to refactor).

**In TypeScript.**
- A port is just an interface or a function type: `type SavePlan = (plan: WeekPlan) => Promise<void>`.
- Core functions receive their dependencies as parameters (plain arguments or a small object) — this is *dependency injection* without any framework: `completeCheckIn(input, { savePlan, now })`.
- Adapters live in their own folder and are the only files allowed to import `pg`, `fetch`-wrappers, SDKs.
- You don't need the full ceremony everywhere. The minimum viable version: **core imports nothing from adapters; adapters import core.** Enforce it (§7).

## 6. File size and when to split a file

**Sources:** Ousterhout (§2) — shallow-module warning cuts both ways; Parnas (§1) — split along design decisions; cohesion (§3).

**What it says.** No primary source gives a magic line count, and Ousterhout explicitly warns that over-splitting creates shallow modules and more interfaces to learn. The principled rule: a file should hide one design decision / hold one cohesive responsibility. Split when the *content* diverges, not when a counter passes 200.

**Practical split triggers.**
- The file has two unrelated reasons to change (e.g., RPE math *and* calendar rendering).
- You use editor search to move around inside it.
- Its tests fall into unrelated groups with unrelated setup.
- Two people (or two agent sessions) keep colliding in it.
- You want to keep part pure and part does I/O — split exactly on that line (§9).

**Anti-trigger.** Don't split a coherent algorithm into five fragments that only make sense together; that raises coupling and hides the flow. One long file with a clear top-to-bottom story beats a maze of two-line files.

## 7. Dependency rules: acyclic and stable

**Sources:** Robert C. Martin, "Stability" (C++ Report, 1997): https://condor.depaul.edu/dmumaugh/OOT/Design-Principles/stability.pdf ; also codified in his *Agile Software Development* / *Clean Architecture* books.

**What it says.**
- **Acyclic Dependencies Principle (ADP):** the dependency graph between modules must have no cycles (A→B→C→A). A cycle welds its members into one lump: none can be tested, understood, or released alone.
- **Stable Dependencies Principle (SDP):** "depend in the direction of stability." A module is *stable* when many things depend on it and it depends on little (hard to change), *unstable* when the reverse (easy to change). Martin's metric: instability I = Ce/(Ca+Ce), where Ca = incoming dependencies, Ce = outgoing. Volatile modules must not sit underneath everything else, or every change to them shakes the tower. Corollary (Stable Abstractions Principle): the stable things everyone depends on should be abstract — interfaces and domain types — because those rarely need edits.

**Why it lowers cost of change.** These rules make the earlier advice mechanical. "Dependencies point toward the core" is SDP: the domain types and pure rules are the stable, abstract center; UI, adapters, and feature glue are the unstable rim that's cheap to change because nothing depends on it. No cycles means every module has a clear "below" it can be tested against.

**In TypeScript — enforcement (don't rely on willpower).**
- **dependency-cruiser** (https://github.com/sverweij/dependency-cruiser): validates your import graph against your own rules — no cycles, "src/core must not import from src/adapters", no orphan files — and can draw the graph (SVG/mermaid). Config in `.dependency-cruiser.js`; start with `npx depcruise --init`; run in CI.
- **eslint-plugin-import** `no-cycle` (https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md): flags circular imports at lint time; the docs call cyclic dependencies "always a dangerous anti-pattern." ESLint core `no-restricted-imports` can ban specific cross-boundary paths.
- **TypeScript project references** (https://www.typescriptlang.org/docs/handbook/project-references.html): split the repo into composite sub-projects (`core`, `adapters`, `app`) each with its own `tsconfig.json`; a project can only import what it explicitly `references`, and `tsc --build` rebuilds only what changed. This is the compiler-enforced version of the boundary — worth it once the project has 2–3 clearly distinct parts; overkill for a small single app. The same boundary logic applies to npm/pnpm *workspaces* in a monorepo: each workspace package declares its dependencies, so the package manager enforces who may import whom.

## 8. Cost-effectiveness: simple first, YAGNI, no premature abstraction

**Source:** Martin Fowler, "Yagni": https://martinfowler.com/bliki/Yagni.html (the principle originates in Extreme Programming — Beck, *Extreme Programming Explained*).

**What it says.** YAGNI — "You Aren't Gonna Need It" — says do not build capability for a *presumed* future need. Fowler itemizes four costs of building early: **cost of build** (effort on a feature that may never be used), **cost of delay** (the feature you actually needed shipped later), **cost of carry** (the extra code makes every subsequent change harder), and **cost of repair** (when the guess was wrong-shaped, you rebuild anyway). Crucial boundary: "Yagni only applies to capabilities built into the software to support a presumptive feature, it does not apply to effort to make the software easier to modify." Keeping code clean, factored, and tested is not a violation of YAGNI — it is what makes YAGNI safe.

**Why it lowers cost.** Structure is your hedge against an unknown future — better than speculation is. A well-factored codebase makes the *actual* future feature cheap to add when it becomes real, without paying carry cost on ten imagined ones. This is also the antidote to *premature abstraction*: an abstraction generalized from one example is a guess, and a wrong abstraction is more expensive than duplication because every user must now be untangled from it.

**In TypeScript.**
- Rule of thumb: extract a shared helper/interface at the *second or third* real usage, when the true shape is visible — not at the first, "just in case."
- No config options, plugin systems, or generic type parameters until a concrete second case demands them.
- Small diffs are the visible symptom of cheap change: if routine features produce sprawling diffs, the structure (not the developer) is the problem — revisit §§1–5.

## 9. Performance-oriented structure

**Sources:** Donald Knuth, "Structured Programming with go to Statements," *ACM Computing Surveys* 6(4), 1974, p. 268 — full paper: https://pic.plover.com/knuth-GOTO.pdf (context walk-through: https://hlopko.com/2019/08/03/premature-optimization/). Gary Bernhardt, "Boundaries" (functional core, imperative shell): https://www.destroyallsoftware.com/talks/boundaries . Cockburn/Martin (§5) for the pure-core separation.

**What Knuth actually said.** The famous line — "premature optimization is the root of all evil" — is routinely clipped. In context, Knuth is making *three* claims at once: programmers waste enormous time worrying about the speed of *noncritical* parts, and those micro-efficiencies should be forgotten roughly 97% of the time; **but** the critical ~3% must not be passed up — a good programmer looks carefully at the critical code, *only after that code has been identified*; and identification must come from **measurement tools**, because programmers' intuitive guesses about where time goes are, in his experience, reliably wrong. So the paper is not anti-performance — Knuth spends much of it on legitimate optimization. It is anti-*guessing*.

**How structure serves performance.**
1. **Measure first, and structure makes measuring possible.** You can only profile a hot path cleanly if it's a distinct module, not smeared across UI handlers.
2. **Isolate hot paths.** Keep the code that runs often or over much data (scoring, plan calculation, aggregation) in small, dedicated, pure modules. Then optimization is a local rewrite behind a stable interface — the deep-module payoff (§2) — instead of surgery across the app.
3. **Separate pure calculation from I/O** ("functional core, imperative shell", Bernhardt). A *pure* function's output depends only on its inputs — no network, disk, clock, or randomness inside. Pure calc modules are: fast (no I/O stalls mixed into loops), benchmarkable in microseconds, trivially testable (call with data, assert on result — thousands of cases per second), cacheable/memoizable, and safe to parallelize. The slow parts of most apps are I/O; keeping I/O at the edges means the core's performance profile is simple and the expensive calls are visible in one thin layer where they can be batched or cached.
4. **Cheap-to-run follows.** Fast pure-core tests keep CI minutes (and LLM/agent iteration loops) short; adapters isolated at the rim make it easy to swap a costly service for a cheaper one — the same seam serves performance and the bill.

**In TypeScript.** The deterministic calculation module pattern: `core/calc/` exports pure functions over plain data (`number`, arrays, plain objects); it imports zero adapters; benchmark it with `node --cpu-prof` or `vitest bench`; the feature layer fetches inputs, calls the calc, persists outputs.

## 10. Remaining TypeScript practicalities

**Colocate tests.** Put `foo.test.ts` beside `foo.ts` (Vitest and Jest pick up `*.test.ts` anywhere by default — https://vitest.dev/config/#include). Colocation keeps the test in view when editing (it's the module's executable documentation), moves/deletes with the feature, and signals which files lack coverage. Keep only cross-feature integration/e2e tests in a separate top-level `tests/` folder.

**Barrel files: avoid by default.** A barrel is an `index.ts` whose only job is `export * from './a'; export * from './b';`. Costs, per the official Vite performance guide (https://vite.dev/guide/performance#avoid-barrel-files): importing one name from a barrel forces fetching and transforming *every* file in the barrel, since any might contain the name or an initialization side effect — slowing dev server startup, bundling, and defeating tree-shaking (dead-code removal). Barrels also make dependency graphs lie (everything appears to depend on everything in the folder) and are the single most common cause of accidental import cycles. Exception: one deliberate barrel at a true package boundary (the public interface of `core/`, or a workspace package's entry point) is fine — that's a curated interface, not a convenience re-export of a whole tree.

**Enforcement recap (make the structure self-defending).**
- CI step: `depcruise src` with rules — no cycles; `core` may not import `features|adapters|app`; `features/x` may not import `features/y` internals.
- ESLint: `import/no-cycle`, `no-restricted-imports` for banned paths.
- Optional at scale: project references or pnpm workspaces to make the compiler/package manager the boundary cop (§7).

---

## Source list

| Topic | Primary source |
|---|---|
| Information hiding | Parnas 1972 — https://wstomv.win.tue.nl/edu/2ip30/references/criteria_for_modularization.pdf |
| Deep modules, complexity | Ousterhout, *A Philosophy of Software Design* — https://web.stanford.edu/~ouster/cgi-bin/book.php ; author interview: https://newsletter.pragmaticengineer.com/p/the-philosophy-of-software-design |
| Cohesion/coupling | Stevens, Myers, Constantine 1974 — https://ieeexplore.ieee.org/document/5388187 |
| Vertical slices | Bogard — https://www.jimmybogard.com/vertical-slice-architecture/ |
| Hexagonal / ports & adapters | Cockburn — https://alistair.cockburn.us/hexagonal-architecture/ |
| Dependency Rule (inward) | Martin 2012 — https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html |
| ADP / SDP, instability metric | Martin, "Stability" — https://condor.depaul.edu/dmumaugh/OOT/Design-Principles/stability.pdf |
| YAGNI, costs of presumptive features | Fowler — https://martinfowler.com/bliki/Yagni.html |
| Premature optimization, in context | Knuth 1974 — https://pic.plover.com/knuth-GOTO.pdf (p. 268) |
| Functional core / imperative shell | Bernhardt — https://www.destroyallsoftware.com/talks/boundaries |
| Barrel-file cost | Vite guide — https://vite.dev/guide/performance#avoid-barrel-files |
| Boundary enforcement | dependency-cruiser — https://github.com/sverweij/dependency-cruiser ; eslint-plugin-import no-cycle — https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md |
| Compiler-enforced boundaries | TS project references — https://www.typescriptlang.org/docs/handbook/project-references.html |
