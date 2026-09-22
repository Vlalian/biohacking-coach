# Coding conventions

- **Use the domain language exactly.** `CONTEXT.md` is the glossary — Weekly
  Session, Week Plan, Session Reflection, Coached Mode, and the rest. Name things
  in code the way `CONTEXT.md` names them; do not drift to synonyms.
- **Keep a pure core, push I/O to the edges.** Business logic (the deterministic
  calc module, prompt rendering) is framework-free and takes plain data in,
  returns plain data out — no DB calls, no HTTP, no `fetch` inside it. Wrap the
  outside world (Postgres/Drizzle, the Anthropic API, the UI) in thin adapters
  that call the core. Dependencies flow one way, toward the core; the core
  imports nothing from features, UI, or the database layer. The full rationale is
  in [.scratch/research/codebase-structure-guidelines.md](../../.scratch/research/codebase-structure-guidelines.md).
- **Respect the architecture that is already decided.** The server owns the
  truth ([ADR 0006](../adr/)): no module reads browser `bh_*` keys, nothing
  durable is device-only, the Anthropic key is a server secret and never ships to
  the browser. Identity is separated from training data by opaque athlete ID —
  training tables never carry a name or email column.
- **No direct identifier reaches the LLM.** Name, email, DOB, and location are
  never sent to the Anthropic API (GDPR decision 1). Prompt builders assert this.
  The incident behind this line is in
  [verify-doc-claims.md](verify-doc-claims.md).
- **Tests have their own rules.** [testing.md](testing.md) — colocated, written
  against a module's exports, spies on boundaries only.
