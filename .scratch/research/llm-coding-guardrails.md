# LLM Coding Guardrails & Specifications — What the Industry Actually Means

Research notes, 2026-07-20. Grounded in primary sources (official docs, vendor pages, the actual spec repositories); every substantive claim cites where it comes from, fetched live on this date. Written for a learning developer: jargon is explained the first time it appears. This brief maps the landscape and then recommends what to add to *this* repo — it grounds every project-specific recommendation in files that are already here.

---

## The Playbook (do this in practice)

The thing the user heard about — "companies have guardrails / specs to make an LLM write production-level code" — is really **three different things** wearing one word. Sort them first, because conflating them is the main confusion:

1. **Agent rules files** — a Markdown file in the repo that the coding agent reads at the start of every session and treats as standing instructions (this repo's `AGENTS.md` is exactly this). It shapes *how the agent writes code*: conventions, commands, "always do X". This is the "guardrail" the user most likely means.
2. **Specs (spec-driven development)** — a written specification of *what to build* for one feature, produced and refined *before* code, which the agent then implements against. Different artifact, different job: rules are standing and cross-cutting; a spec is per-feature and disposable.
3. **Runtime guardrails** — code that validates or filters an LLM's *output at runtime* (schema checks, PII/policy filters). Nothing to do with code generation; this is about what your *shipped Coach* is allowed to say. Named here because the word collides, and because this app genuinely needs some of it (the Coach gives training advice to real people).

Concretely, for this project:

1. **Keep `AGENTS.md` as the single source of agent rules, and make Claude Code read it** by adding a one-line `CLAUDE.md` that imports it (`@AGENTS.md`). Right now Claude Code does **not** read `AGENTS.md` — it reads `CLAUDE.md` — so the working rules in `AGENTS.md` are not actually loading into Claude sessions ([Claude Code memory docs](https://code.claude.com/docs/en/memory)). This is the single highest-value gap found.
2. **Add a short "coding standards / definition of done" section** to `AGENTS.md` (or a `.claude/rules/` file): the stack's non-obvious conventions, the test/lint/typecheck commands, and what "done" means (tests pass, `eslint` clean, `tsc` clean, reviewed). Keep it under ~200 lines — bloated rules files get ignored ([best practices](https://code.claude.com/docs/en/best-practices)).
3. **Give the agent a check it can run.** The single biggest lever for production-quality AI code is a pass/fail signal — tests, a build, a linter — that the agent runs itself and iterates against ([best practices](https://code.claude.com/docs/en/best-practices)). This repo has `vitest`, `eslint`, and `tsc` but no CI gate wiring them into the agent loop yet.
4. **Adopt spec-driven development lightly, reusing what you have.** You already write PRDs and issues under `.scratch/` and ADRs under `docs/adr/`. That *is* a spec layer. Formalize the habit — a written, self-contained spec per feature that names files, scope, and an end-to-end verification step — rather than importing a heavyweight tool ([best practices "let Claude interview you"](https://code.claude.com/docs/en/best-practices)).
5. **Keep the two enforcement tiers straight.** A rules file is *advisory* (the model may drift); a **hook** is *deterministic* (a script that runs regardless). You already rely on this distinction — `.claude/hooks/block-dangerous-git.sh` enforces, `AGENTS.md` advises. Anthropic states this explicitly: "CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer" ([memory docs](https://code.claude.com/docs/en/memory)).
6. **Separately, plan runtime guardrails for the Coach itself** (Topic-3 of the confusion): validate the model's structured outputs (the Week Plan JSON) against a schema, and add a safety check on generated *advice* (the Coach must not give medical/injury advice it shouldn't). This is a product concern, not a codegen concern — flagged here so it isn't lost.

The rest of this document is the sourced detail behind each of these.

---

## Part A — The two meanings of "guardrail" (disambiguation first)

The word **guardrail** is used for two unrelated things, and the user's phrasing ("guardrails or specifications for instructing an LLM to generate better code") mixes them. Getting production-quality *code generation* is about categories 1–2 below; category 3 is about controlling a *deployed* LLM's behavior.

- **Behavioral instruction files** (this document's Part B) — a static Markdown file the coding agent reads as context. It has no runtime; it is prose the model tries to follow. Anthropic is blunt that it is *not* enforcement: "Claude treats them as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook instead" ([Claude Code memory docs](https://code.claude.com/docs/en/memory)).
- **Runtime output validation** (this document's Part E) — a software library that sits between the LLM and the rest of your app, inspects each response, and can reject, retry, or rewrite it. Guardrails AI and NeMo Guardrails are the two named examples. This is real code with real control flow, enforced at request time.

A useful test: if the artifact is *read by a coding assistant while you build the app*, it's category 1. If it's *imported into your app and runs when a user talks to the Coach*, it's category 3.

---

## Part B — Agent rules files: the mechanism

An **agent rules file** (also "memory file", "custom instructions", "rules") is a Markdown file, committed to the repo, that a coding agent loads at the start of a session and treats as standing instructions. It is the dominant mechanism the industry uses to make AI assistants follow a project's conventions. Every major tool has its own filename; the field is converging on one shared name (`AGENTS.md`). Here is each, from primary docs.

### 1. Claude Code — `CLAUDE.md` (+ auto-memory, + `.claude/rules/`)

Claude Code (the tool this repo is built with) reads **`CLAUDE.md`** at the start of every session: "CLAUDE.md files are markdown files that give Claude persistent instructions... You write these files in plain text; Claude reads them at the start of every session" ([memory docs](https://code.claude.com/docs/en/memory)). Locations, in load order broad→specific: managed-policy (org-wide), user (`~/.claude/CLAUDE.md`), project (`./CLAUDE.md` or `./.claude/CLAUDE.md`), local (`./CLAUDE.local.md`, gitignored) (ibid.).

What to put in it, from Anthropic's own guidance: "Include Bash commands, code style, and workflow rules. This gives Claude persistent context it can't infer from code alone" ([best practices](https://code.claude.com/docs/en/best-practices)). And what to leave *out* — the doc gives an explicit include/exclude table: include "Bash commands Claude can't guess", "Code style rules that differ from defaults", "Testing instructions", "Repository etiquette", "Architectural decisions specific to your project", "Common gotchas"; exclude "Anything Claude can figure out by reading code", "Standard language conventions", "Self-evident practices like 'write clean code'" (ibid.).

Critical size rule: "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence" ([memory docs](https://code.claude.com/docs/en/memory)). And a failure mode worth internalizing: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" ([best practices](https://code.claude.com/docs/en/best-practices)).

Two companion mechanisms in the same system:
- **`.claude/rules/`** — topic-scoped Markdown files, optionally gated to file globs via `paths:` frontmatter, so a rule only loads when the agent touches matching files: "Rules can be scoped to specific files using YAML frontmatter with the `paths` field" ([memory docs](https://code.claude.com/docs/en/memory)). This is how you keep the always-loaded `CLAUDE.md` small while still having, say, a `src/api/**` rule.
- **Auto-memory** — notes Claude writes *itself* across sessions, indexed by a `MEMORY.md`, first 200 lines / 25 KB loaded each session (ibid.). This repo already uses it — the user's `MEMORY.md` index is quoted at the top of every session.

**Imports.** `CLAUDE.md` can pull in other files with `@path` syntax: "CLAUDE.md files can import additional files using `@path/to/import` syntax. Imported files are expanded and loaded into context at launch" ([memory docs](https://code.claude.com/docs/en/memory)). This is the mechanism the recommendation below uses to bridge `AGENTS.md` → Claude Code.

### 2. The cross-tool standard — `AGENTS.md` (this repo already has one)

`AGENTS.md` is "a simple, open format for guiding coding agents", described as "a dedicated, predictable place to provide the context and instructions to help AI coding agents work on your project", used by "over 60k open-source projects" ([agents.md](https://agents.md/)). It deliberately complements, not replaces, the README: "README.md files are for humans: quick starts, project descriptions, and contribution guidelines"; `AGENTS.md` holds "the extra, sometimes detailed context coding agents need: build steps, tests, and conventions" (ibid.).

Format: plain Markdown, no required schema. Typical sections: "project overview, build and test commands, code style guidelines, testing instructions, and security considerations" ([agents.md](https://agents.md/)). Monorepo behavior: "Place another AGENTS.md inside each package. Agents automatically read the nearest file in the directory tree, so the closest one takes precedence" (ibid.).

It is genuinely cross-tool: the standard "was formalised as an open specification in August 2025... led by OpenAI with participation from Google, Cursor, and Factory", and is read by 30+ agents including "OpenAI Codex, Claude Code (via import), GitHub Copilot, Cursor, Gemini CLI, Google Jules, Factory, Aider, Zed, VS Code, Windsurf, and Devin" ([AGENTS.md standard, per agents.md](https://agents.md/)). Note the parenthetical for Claude Code: **"via import"** — Claude Code does not read `AGENTS.md` natively (see §1 and the recommendation).

### 3. Cursor — `.cursor/rules/*.mdc`

Cursor (a popular AI-first editor) uses a `.cursor/rules/` directory of **`.mdc`** files ("Markdown Cursor" — Markdown with a YAML frontmatter header): "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled. The system requires the `.mdc` extension with frontmatter metadata; plain `.md` files are ignored unless they're `AGENTS.md`" ([Cursor Rules docs](https://cursor.com/docs/rules)).

Four activation modes — this is the notable design idea, letting rules load conditionally rather than always: "**Always Apply** — Apply to every chat session; **Apply Intelligently** — When Agent decides it's relevant based on description; **Apply to Specific Files** — When file matches a specified pattern; **Apply Manually** — When @-mentioned in chat" ([Cursor Rules docs](https://cursor.com/docs/rules)). Controlled by three frontmatter fields: `alwaysApply` (boolean), `description` (helps the agent judge relevance), `globs` (path patterns) (ibid.). Cursor also now reads `AGENTS.md` in the project root as a simpler alternative (ibid.).

### 4. GitHub Copilot — `.github/copilot-instructions.md`

GitHub Copilot reads a repo-wide instructions file: "create a file named `.github/copilot-instructions.md` in the root of your repository... and add natural language instructions to the file in Markdown format" ([GitHub Docs — repository custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)). Copilot supports three kinds: `copilot-instructions.md` (repo-wide), `*.instructions.md` (path-scoped, via an `applyTo` glob), and — again — `AGENTS.md` ([GitHub Docs — custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)). It applies them broadly: "Copilot automatically reads it and applies the instructions to every interaction — inline code completions, Copilot Chat responses, pull request reviews". GitHub's own best-practice line echoes everyone else's: "The best... custom instructions are specific, actionable, and concise" ([GitHub blog — 5 tips](https://github.blog/ai-and-ml/github-copilot/5-tips-for-writing-better-custom-instructions-for-copilot/)).

### 5. Windsurf, Aider, and the rest

- **Windsurf** (Codeium's agentic editor, "Cascade"): workspace rules in `.windsurf/rules/` (Markdown, one topic per file) plus a legacy single-file `.windsurfrules`; also reads `AGENTS.md` per the cross-tool list ([agents.md](https://agents.md/)). *(Windsurf's own docs were not fetched for this note; the `.windsurf/rules/` path is reported widely but is cited here as secondary — verify against docs.windsurf.com before relying on the exact path.)*
- **Aider** (a terminal AI pair-programmer): uses an ordinary `CONVENTIONS.md` loaded read-only. From its docs: "Sometimes you want GPT to be aware of certain coding guidelines... The simplest approach involves creating a markdown file with your preferences." Load it with "`/read CONVENTIONS.md` or `aider --read CONVENTIONS.md`... marked as read-only, and cached" ([Aider conventions docs](https://aider.chat/docs/usage/conventions.html)). Aider's docs include a neat proof that these files *work*: with a conventions file specifying `httpx` + type hints, the LLM "correctly used `httpx` and provided type hints"; without it, the same task "produced code using `requests` instead" (ibid.).
- **Cody (Sourcegraph)**, **Gemini CLI**, **Zed**, **Devin**, **Codex** — all either read `AGENTS.md` or their own equivalently-shaped file. The convergence is the point: the industry has settled that "a committed Markdown rules file the agent reads first" is *the* mechanism.

**Takeaway for the repo:** you already have the right artifact (`AGENTS.md`). The gap is tool wiring (Claude Code doesn't read it) and content (it currently holds process rules, not coding standards). Both addressed in Part F.

---

## Part C — Spec-driven development (specs, not rules)

A **spec** in this world is a written description of *what one feature should do and why*, produced and refined *before* implementation, which the agent then builds against. The distinction from a rules file matters: a rules file is standing and cross-cutting ("always use 2-space indent"); a spec is per-feature and consumed once ("build Google OAuth: these files, this flow, these acceptance tests"). Both improve AI output; they are complementary, not alternatives.

### 1. GitHub Spec Kit — the `constitution → specify → plan → tasks → implement` loop

GitHub's **Spec Kit** is an open toolkit for "Spec-Driven Development" (SDD). Its thesis: SDD "flips the script on traditional software development" by making "specifications become executable, directly generating working implementations rather than just guiding them"; it is "intent-driven development where specifications define the 'what' before the 'how'" and relies on "multi-step refinement rather than one-shot code generation from prompts" ([github/spec-kit](https://github.com/github/spec-kit)).

The workflow is a sequence of slash-commands, each producing a Markdown artifact the next reads ([github/spec-kit](https://github.com/github/spec-kit), [Spec Kit docs](https://github.github.com/spec-kit/)):
1. **`/speckit.constitution`** — "project's governing principles and development guidelines that will guide all subsequent development." (This is the cross-cutting, rules-like layer — closest thing Spec Kit has to `AGENTS.md`.)
2. **`/speckit.specify`** — "Define requirements by describing what to build, focusing on the 'what' and 'why' rather than technical details."
3. **`/speckit.clarify`** — "Address underspecified areas (recommended before planning)."
4. **`/speckit.plan`** — "Create technical implementation strategies with your chosen technology stack and architecture."
5. **`/speckit.tasks`** — "Generate actionable task lists for implementation."
6. **`/speckit.analyze`** — "cross-artifact consistency & coverage analysis before implementation begins."
7. **`/speckit.implement`** — "Execute all tasks to build the feature according to the plan."

The **constitution** is worth flagging: it is a spec-driven project's version of a persistent rules file — "a set of non-negotiable principles" captured once and applied to every feature. This maps directly onto what `AGENTS.md` + ADRs already do here.

### 2. Amazon Kiro — `requirements.md`, `design.md`, `tasks.md`

**Kiro** (AWS's spec-driven agentic IDE) formalizes the same idea into three files per feature: "Specs or specifications are structured artifacts that formalize the development process for features and bug fixes" ([Kiro specs docs](https://kiro.dev/docs/specs/)). The three:
- **`requirements.md`** — "Captures user stories, acceptance criteria, or bug analysis in structured notation." Kiro uses **EARS notation** (Easy Approach to Requirements Syntax — a template for writing testable requirement sentences, e.g. "*When* [trigger], the system *shall* [response]") to keep requirements unambiguous ([Kiro overview, AWS](https://aws.amazon.com/startups/prompt-library/kiro-project-init); the EARS detail was reported in AWS/community coverage — the specs doc page itself did not restate it).
- **`design.md`** — "Documents technical architecture, sequence diagrams, and implementation considerations."
- **`tasks.md`** — "Provides a detailed implementation plan with discrete, trackable tasks."

Kiro also has a separate **Agent Steering** feature — "rules files that specify coding standards, design patterns, or architectural constraints" ([Kiro, per AWS coverage](https://aws.amazon.com/startups/prompt-library/kiro-project-init)). Note the clean split Kiro draws, which is the lesson for us: **steering = standing rules (the `AGENTS.md` role); specs = per-feature what-to-build.**

### 3. Anthropic's own take — the lightweight "interview → SPEC.md" pattern

Anthropic doesn't ship a Spec Kit, but its best-practices doc describes the same idea without the ceremony: "For larger features, have Claude interview you first... Ask about technical implementation, UI/UX, edge cases... then write a complete spec to SPEC.md. Once the spec is complete, start a fresh session to execute it" ([best practices](https://code.claude.com/docs/en/best-practices)). And it names what a good spec contains: "The most useful specs are self-contained: they name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step that proves the feature works. Time spent making the spec precise pays off more than time spent watching the implementation" (ibid.). This is the pattern to adopt here — it fits the existing PRD/issue habit rather than replacing it.

### 4. OpenAI's Model Spec — a useful *analogy*, not a codegen tool

OpenAI's **Model Spec** is often cited in "spec" conversations but is a *different kind* of spec — it specifies how a deployed *model* should behave, not how to build a feature. It "outlines intended behavior for OpenAI's models" and exists as "a transparency tool" ([Model Spec 2025-12-18](https://model-spec.openai.com/2025-12-18.html); [Introducing the Model Spec](https://openai.com/index/introducing-the-model-spec/)). Its structure is instructive as an *analogy* for how to layer rules by strength — it uses three principle types: "**Objectives**" (broad goals like "assist the developer and end user"), "**Rules**" (hard "never do X / if X then Y" constraints), and "**Defaults**" (overridable defaults that "explicitly yield final control to the developer/user") ([Model Spec](https://model-spec.openai.com/2025-12-18.html)). It also defines a **chain of command** — "Instructions with higher authority override those with lower authority" — ordering root > system > developer > user > guideline (ibid.).

Why this matters for *your* Coach: when you write the Coach's system prompt and its behavioral rules (never give medical advice, always defer to the Head Coach on plan authority, etc.), the objectives/rules/defaults split and a clear authority order are a proven way to structure it. That is a product-prompt concern, and CONTEXT.md already gestures at it ("guard-railed participant", "Peer Authority") — but it is a *runtime behavior spec*, not a coding-agent rules file. Keep the two mentally separate.

---

## Part D — What actually makes AI generate production-level code

Rules files and specs *set up* good output; they don't *guarantee* it. The evidence-backed practices that most move code from "plausible demo" to "production" are about **verification, gates, and precise context** — mostly from Anthropic's own engineering guidance.

1. **Give the agent a check it can run itself.** This is the headline. "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop... Give Claude something that produces a pass or fail, and the loop closes on its own" ([best practices](https://code.claude.com/docs/en/best-practices)). The check is "a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design" (ibid.).

2. **Test-first / provide verification criteria.** The doc's before/after: instead of "implement a function that validates email addresses", say "write a validateEmail function. example test cases: [...] run the tests after implementing" ([best practices](https://code.claude.com/docs/en/best-practices)). One named failure pattern is "The trust-then-verify gap" — "Claude produces a plausible-looking implementation that doesn't handle edge cases" — with the fix "Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it" (ibid.).

3. **Gate the "done" with escalating strength.** Options, weakest→strongest: ask it to run the check in-prompt; set a `/goal` condition re-checked every turn; a **Stop hook** that "runs your check as a script and blocks the turn from ending until it passes"; or an **adversarial review subagent** where "a fresh model try[ies] to refute the result, so the agent doing the work isn't the one grading it" ([best practices](https://code.claude.com/docs/en/best-practices)). The repo's `/code-review`-before-commit rule and CodeRabbit-on-PR are exactly this pattern (advisory + a second reviewer).

4. **Explore → plan → implement, don't jump to code.** "Letting Claude jump straight to coding can produce code that solves the wrong problem." The recommended four phases are Explore (plan mode, read-only), Plan (write a detailed plan), Implement (verify against the plan), Commit ([best practices](https://code.claude.com/docs/en/best-practices)).

5. **Precise context beats vague prompts.** "Reference specific files, mention constraints, and point to example patterns... 'look at how existing widgets are implemented... follow the pattern'" ([best practices](https://code.claude.com/docs/en/best-practices)). Anti-examples and "follow this existing pattern" are how you encode taste.

6. **Enforce the non-negotiables with hooks, not prose.** "Use hooks for actions that must happen every time with zero exceptions... Unlike CLAUDE.md instructions which are advisory, hooks are deterministic" ([best practices](https://code.claude.com/docs/en/best-practices)). Security rules that *must* hold (no secrets in code, no writes to migrations without review) belong in a hook or CI, not only in a rules file.

7. **Manage context.** Performance "degrades as context fills"; use `/clear` between tasks, subagents for investigation, and keep the rules file lean ([best practices](https://code.claude.com/docs/en/best-practices)). A bloated `CLAUDE.md` is itself a cause of ignored instructions.

The synthesis: **production-quality AI code = a lean rules file (conventions + commands) + a precise per-feature spec + a machine-checkable definition of done (tests/lint/typecheck/CI) that the agent runs and iterates against + a fresh-eyes review.** This repo has pieces of all four; the gaps are named in Part F.

---

## Part E — Runtime output guardrails (the other "guardrail")

These are libraries you import into your *application* to police the LLM's output at request time. They are irrelevant to *generating* your code but relevant to *what your Coach is allowed to say*. Named so the two senses don't blur — and because a health-coaching LLM has a real need here.

### Guardrails AI

"Guardrails is a Python framework that helps build reliable AI applications" by "running Input/Output Guards in your application that detect, quantify and mitigate the presence of specific types of risks" ([guardrails-ai/guardrails](https://github.com/guardrails-ai/guardrails)). Mechanism: you attach **validators** (from the "Guardrails Hub" — pre-built checks for "toxic language detection, PII detection, competitor checking", etc.) to an output schema; the guard validates each response and can re-ask the model on failure ([Guardrails validators docs](https://guardrailsai.com/docs/concepts/validators)). Structured output: "Guardrails AI accepts a Pydantic model or a JSON Schema definition as the output contract for a Guard. It prompts the LLM to return a response matching that schema, then validates the parsed JSON" ([Guardrails structured data docs](https://guardrailsai.com/docs/how_to_guides/generate_structured_data)). (The older XML "RAIL" spec format is legacy; Pydantic is the recommended path.)

### NeMo Guardrails (NVIDIA)

"NeMo Guardrails is an open-source toolkit for easily adding programmable guardrails to LLM-based conversational systems" ([NVIDIA-NeMo/Guardrails](https://github.com/NVIDIA-NeMo/Guardrails)). It defines **five rail types**, each intercepting a different point in the request (ibid.):
- **Input rails** — "applied to the input from the user; an input rail can reject the input... or alter the input."
- **Dialog rails** — "influence how the LLM is prompted... determine if an action should be executed, if the LLM should be invoked."
- **Retrieval rails** — "applied to the retrieved chunks in the case of a RAG scenario; a retrieval rail can reject a chunk."
- **Execution rails** — "applied to input/output of the custom actions (a.k.a. tools) that need to be called by the LLM."
- **Output rails** — "applied to the output generated by the LLM; an output rail can reject the output... or alter it."

Rails are authored in **Colang**, "a modeling language specifically created for designing... dialogue flows" ([NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails)).

**Relevance to this app:** the Coach is a conversational LLM giving training advice to real athletes, with a RAG Knowledge Oracle planned and tool-use (the deterministic calc module) already decided. The categories above map onto genuine needs: an **input rail** (don't let a prompt-injection in a Session Reflection comment hijack the Coach), a **retrieval rail** (RAG hygiene), an **output rail** (the Coach must not give medical/injury diagnoses — a documented product boundary). This is future product work, but the vocabulary is worth having now. It is *distinct* from the codegen guardrails that are this document's main subject.

---

## Part F — What to add to THIS repo (grounded in what's here)

### What already exists (and is good)

Read directly from the repo on 2026-07-20:

- **`AGENTS.md`** — a "pointer file agents read first" ([OVERVIEW.md](../../OVERVIEW.md)). Its current content is **process rules**: "Review code before committing it" (run `/code-review` on `src/`, `scripts/`, build config before commit/PR), "One worktree per implementation session", and pointers to the issue tracker, triage labels, and domain docs.
- **ADRs** — `docs/adr/0001..0006`, capturing durable decisions (server-authoritative architecture, the Next.js/better-auth/Neon stack, coach authority model). This is your architectural-decision spec layer.
- **`CONTEXT.md`** — a strict domain glossary ("Use these terms exactly... Do not drift to synonyms"). This is an unusually strong asset: it is effectively a *ubiquitous-language spec* that keeps agent output on-vocabulary.
- **A git-safety hook** — `.claude/hooks/block-dangerous-git.sh`, the *enforced* layer (blocks force-push, hard reset, bulk discards). `AGENTS.md` is explicit that this is the enforcement tier and the code-review rule is only advisory — the correct mental model.
- **Auto-memory** — the user's `MEMORY.md` index, carrying standing feedback (decision-briefing style, git-push approval, code-review-before-commit, worktree-per-session, verify-enforcement-claims).
- **Tooling for a definition of done** — `package.json` has `test` (`vitest run`), `lint` (`eslint`), and Next.js `build`; `eslint.config.mjs` extends `next/core-web-vitals` + `next/typescript`.

### The gaps

1. **Claude Code is not reading `AGENTS.md`.** This is the important one. Anthropic's docs are explicit: "Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository already uses `AGENTS.md`... create a `CLAUDE.md` that imports it" ([memory docs](https://code.claude.com/docs/en/memory)). There is **no `CLAUDE.md` at the repo root** (verified). So the working rules in `AGENTS.md` — review-before-commit, worktree-per-session — are *not loading into Claude Code sessions at all*. They currently hold only because they're also in the user's auto-memory. Fix:

   Create `./CLAUDE.md`:
   ```markdown
   @AGENTS.md

   ## Claude Code specifics
   - Run `npm run lint`, `npm test`, and `npx tsc --noEmit` before committing product code.
   - Use plan mode for changes under `src/` that touch more than one feature.
   ```
   Anthropic's exact recommended shape ([memory docs](https://code.claude.com/docs/en/memory)). (A symlink also works but "On Windows, creating a symlink requires Administrator privileges... so use the `@AGENTS.md` import instead" — relevant, this is a Windows repo.)

2. **No coding-standards / definition-of-done content anywhere the agent reads.** `AGENTS.md` holds *process* rules but not *code* rules. There is no stated "run lint+typecheck+tests before you call it done", no naming conventions beyond CONTEXT.md's glossary, no "keep the pure core / push I/O to edges" rule (which lives in `.scratch/research/codebase-structure-guidelines.md` but isn't loaded by the agent). Add a compact "Coding standards" + "Definition of done" section — either in `AGENTS.md` (so all tools get it) or a `.claude/rules/coding-standards.md`. Keep the always-loaded part under ~200 lines ([memory docs](https://code.claude.com/docs/en/memory)); push file-specific rules into `paths:`-scoped `.claude/rules/` files (e.g. an `src/**` rule pointing at the pure-core convention).

3. **No machine-checkable gate wired into the agent loop or CI.** The scripts exist (`test`, `lint`, `build`) but nothing makes the agent *run* them as its definition of done, and there's no CI file found (no `.github/workflows/`). Per Part D, the single biggest quality lever is a check the agent runs itself. Two cheap moves: (a) state the check in the rules file ("Definition of done: `eslint` clean, `tsc --noEmit` clean, `vitest run` green"); (b) optionally a Stop hook or CI workflow so it's *enforced*, not just advised.

4. **The spec layer is real but informal.** You already produce PRDs + issues (`.scratch/`) and ADRs — that *is* spec-driven development in substance. Formalize the per-feature spec habit along Anthropic's "self-contained spec" definition: name the files/interfaces, state what's out of scope, end with an end-to-end verification step ([best practices](https://code.claude.com/docs/en/best-practices)). No need to adopt Spec Kit or Kiro wholesale — but their `requirements → design → tasks` shape is a good checklist for what a PRD should contain. Spec Kit's **constitution** concept is already covered by `AGENTS.md` + ADRs; don't duplicate it.

5. **Runtime Coach guardrails are undesigned.** Separate track (Part E), but flag it: the deployed Coach needs output validation (Week Plan schema) and a safety rail on generated advice. Not a codegen task — a product task. CONTEXT.md's "guard-railed participant" language is a placeholder, not an implementation.

### Recommended minimal shape

```
CLAUDE.md                      # NEW: @AGENTS.md import + Claude-specific lines  (gap 1)
AGENTS.md                      # KEEP; ADD a "Coding standards" + "Definition of done" section (gap 2,3)
.claude/rules/
  src-conventions.md           # OPTIONAL, paths: ["src/**"]  — pure-core rule, naming (gap 2)
docs/adr/                      # KEEP — architectural decision specs
CONTEXT.md                     # KEEP — domain-language spec (strong asset)
.scratch/<feature>/PRD.md      # KEEP — per-feature specs; tighten to "self-contained" checklist (gap 4)
.github/workflows/ci.yml       # OPTIONAL — enforce lint+typecheck+test (gap 3)
```

This complements rather than rebuilds. The user's instinct — "add a guardrails/spec layer" — is right; the finding is that **~80% of it already exists** (rules file, ADRs, glossary, review rule, git hook, test tooling), and the highest-leverage additions are small: wire `AGENTS.md` into Claude Code, add a definition-of-done, and make the agent run the checks it already has.

---

## Sources

Primary sources fetched or searched on 2026-07-20:

- Claude Code memory / CLAUDE.md: https://code.claude.com/docs/en/memory
- Claude Code best practices: https://code.claude.com/docs/en/best-practices
- AGENTS.md standard: https://agents.md/
- Cursor Rules: https://cursor.com/docs/rules
- GitHub Copilot custom instructions: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide ; https://github.blog/ai-and-ml/github-copilot/5-tips-for-writing-better-custom-instructions-for-copilot/
- Aider conventions: https://aider.chat/docs/usage/conventions.html
- GitHub Spec Kit: https://github.com/github/spec-kit ; https://github.github.com/spec-kit/
- Amazon Kiro specs: https://kiro.dev/docs/specs/ ; https://aws.amazon.com/startups/prompt-library/kiro-project-init
- OpenAI Model Spec: https://model-spec.openai.com/2025-12-18.html ; https://openai.com/index/introducing-the-model-spec/
- Guardrails AI: https://github.com/guardrails-ai/guardrails ; https://guardrailsai.com/docs/concepts/validators ; https://guardrailsai.com/docs/how_to_guides/generate_structured_data
- NeMo Guardrails: https://github.com/NVIDIA-NeMo/Guardrails
- Repo files referenced: AGENTS.md, OVERVIEW.md, CONTEXT.md, docs/adr/0005-0006, package.json, eslint.config.mjs, .claude/hooks/block-dangerous-git.sh, .scratch/research/codebase-structure-guidelines.md
