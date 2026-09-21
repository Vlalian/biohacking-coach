# Definition of done

Product code (`src/`, `scripts/`, build config) is not done until all four pass:

    npm run lint          # eslint clean
    npx tsc --noEmit      # types clean
    npm test              # vitest green
    npm run build         # next build succeeds (for changes that affect the build)

Run them yourself and iterate against them before you call the work done —
"looks done" is not a signal, a passing check is. Do **not** run `/code-review`
afterwards — that is his to spend ([code-review.md](code-review.md)); commit and
say plainly that the work is unreviewed. If a check fails and you are leaving it
failing, say so plainly and why; a silently skipped check is the same failure
mode as a silently skipped review.

UI primitives have a fifth check: [visual-snapshots.md](visual-snapshots.md).
