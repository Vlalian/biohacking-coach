# Definition of done

Product code (`src/`, `scripts/`, build config) is not done until all four pass:

    npm run lint          # oxlint clean, then eslint clean
    npx tsc --noEmit      # types clean
    npm test              # vitest green
    npm run build         # next build succeeds (for changes that affect the build)

Lint is two layers: Oxlint (`.oxlintrc.json`, ~3 s) carries what it can, and
ESLint (`eslint.config.mjs`, ~90 s) turns those rules off via
`eslint-plugin-oxlint` so nothing is judged twice. What still runs under ESLint
is the `it.only` selector rule, which Oxlint has no selector engine for, and the
jsx-a11y set, which `.oxlintrc.json` deliberately leaves to ESLint.
While iterating, `npm run lint:fast` runs Oxlint alone; the full `npm run lint`
is what "done" means.

Run them yourself and iterate against them before you call the work done —
"looks done" is not a signal, a passing check is. Do **not** run `/code-review`
afterwards — that is his to spend ([code-review.md](code-review.md)); commit and
say plainly that the work is unreviewed. If a check fails and you are leaving it
failing, say so plainly and why; a silently skipped check is the same failure
mode as a silently skipped review.

UI primitives have a fifth check: [visual-snapshots.md](visual-snapshots.md).
