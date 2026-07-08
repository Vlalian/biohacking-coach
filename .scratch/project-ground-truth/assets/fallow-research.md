# Research: what is fallow, and is it in use here?

Asset for [Identify fallow and rule on its artifacts](../issues/07-identify-fallow-and-rule-on-artifacts.md). Researched 2026-07-08.

## What fallow is

**Fallow** ([fallow-rs/fallow](https://github.com/fallow-rs/fallow), [docs.fallow.tools](https://docs.fallow.tools/integrations/vscode)) is a Rust-native "codebase intelligence" CLI for TypeScript and JavaScript: static analysis for unused code, unused exports, duplication, circular dependencies, and complexity hotspots. It's marketed for keeping AI-generated code clean. Config resolution: `.fallowrc.json` > `fallow.toml` > `.fallow.toml`, read from the project root; the config supports `entry` and `ignorePatterns` keys — exactly the shape of this repo's [.fallowrc.json](../../../.fallowrc.json). Its `.fallow/cache.bin` is the analysis cache, and the tool writes a self-ignoring `.gitignore` (`*`) into the cache dir.

## Evidence in this repo

| Artifact | Finding |
|---|---|
| `.fallowrc.json` (root) | entry: `poc/server.js`, `poc/public/js/app.js`; ignores `poc/node_modules/**` — a valid minimal fallow config |
| `.fallow/cache.bin` (root) | 89,424 bytes, last written **2026-06-25 13:59** |
| `poc/.fallow/cache.bin` | 89,424 bytes, last written **2026-06-25 13:45** |
| CLI | Not on PATH, not in `poc/node_modules/.bin` — likely run via a since-removed binary or `npx`-equivalent |

## Read

Fallow was run twice on 2026-06-25 — once from `poc/` and 14 minutes later from the repo root (hence the duplicate cache dirs; it caches per working directory). The Session Negotiation dead code was deleted on **2026-06-26**. The near-certain story: fallow's unused-code analysis was the instrument that found that dead code, in a one-off trial. Nothing indicates ongoing use.

## Recommendation

Keep `.fallowrc.json` (one small, valid file that makes any future run instant and documents the entry points); the cache dirs are already gitignored and freely deletable — they regenerate on the next run. Final disposition ruled by Mads on the ticket.

Sources: [fallow-rs/fallow on GitHub](https://github.com/fallow-rs/fallow), [fallow docs](https://docs.fallow.tools/integrations/vscode), [dev.to introduction](https://dev.to/bartwaardenburg/i-built-a-rust-based-codebase-analyzer-that-finds-dead-code-in-jsts-projects-in-milliseconds-180i), [Medium: How to Use Fallow to Keep AI-Generated Code Clean](https://medium.com/@stawils/how-to-use-fallow-to-keep-ai-generated-code-clean-569dba4ff7a8)
