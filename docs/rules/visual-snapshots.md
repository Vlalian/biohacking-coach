# A primitive ships with its snapshot

A component in `src/components/ui` is covered by a `*.visual.tsx` in that folder
(its own file, or a case in `primitives.visual.tsx`), and any change to one — or
to `globals.css` — is run through `npm run test:visual` before commit; a
full-page change through `npm run test:e2e` (needs the dev database and the seed
accounts in `.env.local`). Baselines are committed `-win32` PNGs under
`__snapshots__/`, regenerated with the matching `:update` script only when the
change in appearance was the point. Rationale and the platform ruling:
`.scratch/frontend-quality/`.
