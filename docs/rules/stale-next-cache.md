# If several unrelated routes 404 at once, it is the build cache

A single page returning 404 is a bug in that page. **Every authenticated route
returning 404 at once — `/da/training-plan` and a coach page and the rest — is
not a bug, it is a stale `.next`.** Delete it and restart the dev server before
reading any code:

    Remove-Item -Recurse -Force .next    # PowerShell; `rm -rf .next` in bash
    npm run dev

The discriminator is the point: *one* route failing points at the code, *all*
of them failing points at the cache. On 2026-09-04 the smoke run lost an hour
because the dev log had said "404 for every route" from the start and the code
was read first (`code-health/10`).

The same not-found page also appears **once, on a cold dev server**, for the
first request to a dynamic route Turbopack has not compiled yet (seen on
`/coach/athlete/[id]/*` with no `.next` at all, 2026-09-17). Reload before
concluding anything; the page suite's `settled()` does exactly that.
