# Identify fallow and rule on its artifacts

Label: wayfinder:research
Status: ready-for-agent
Blocked by: (none)
Map: ../MAP.md

## Question

`.fallowrc.json` (entry: poc/server.js, poc/public/js/app.js; ignores node_modules) plus two `.fallow/cache.bin` directories (repo root and poc/) sit unexplained. The config shape suggests a dead-code detection tool, but nothing in the repo says what it is, why there are two cache locations, or whether it's still in use.

Research (AFK): identify the tool (npm/GitHub lookup for "fallow"), what the caches are, and whether the duplicate root/poc caches indicate it was run from two working directories. Produce a short markdown summary as a linked asset. Recommend: keep (and document in OVERVIEW.md / gitignore the caches) or remove the artifacts. If still-in-use can't be determined from research alone, record that and hand the final keep/remove call to Mads as a one-line question — don't answer for him.
