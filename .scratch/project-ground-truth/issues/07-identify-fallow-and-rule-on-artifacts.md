# Identify fallow and rule on its artifacts

Label: wayfinder:research
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

`.fallowrc.json` (entry: poc/server.js, poc/public/js/app.js; ignores node_modules) plus two `.fallow/cache.bin` directories (repo root and poc/) sit unexplained. The config shape suggests a dead-code detection tool, but nothing in the repo says what it is, why there are two cache locations, or whether it's still in use.

Research (AFK): identify the tool (npm/GitHub lookup for "fallow"), what the caches are, and whether the duplicate root/poc caches indicate it was run from two working directories. Produce a short markdown summary as a linked asset. Recommend: keep (and document in OVERVIEW.md / gitignore the caches) or remove the artifacts. If still-in-use can't be determined from research alone, record that and hand the final keep/remove call to Mads as a one-line question — don't answer for him.

## Resolution

Done 2026-07-08. Full findings in the linked asset: [fallow-research.md](../assets/fallow-research.md).

Gist: **fallow** is a Rust-native static-analysis CLI for TS/JS (unused code, duplication, circular deps) from [fallow-rs/fallow](https://github.com/fallow-rs/fallow); `.fallowrc.json` is its config, `cache.bin` its per-working-directory analysis cache. It was run twice on 2026-06-25 (from `poc/` and from the root — hence two cache dirs), the day before the Session Negotiation dead code was deleted: almost certainly the instrument that found it. The CLI is not installed anywhere now — a one-off trial, not ongoing use.

**Ruling (Mads, 2026-07-08): keep `.fallowrc.json`, delete the caches.** Executed — both `.fallow/` dirs removed (they regenerate on any future run); the config stays as documentation of the entry points and to make a future run instant.
