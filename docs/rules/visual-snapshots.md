# A primitive ships with its snapshot

A component in `src/components/ui` is covered by a `*.visual.tsx` in that folder
(its own file, or a case in `primitives.visual.tsx`), and any change to one — or
to `globals.css` — is run through `npm run test:visual` before commit; a full-
page change through `npm run test:e2e` (runs on its own Neon branch `test/e2e` —
`E2E_DATABASE_URL` in `.env.local`, `neon connection-string test/e2e` — reset to
its parent `seed-template` with the Neon CLI and reseeded every run, with the
Coach switched off by `COACH_DISABLED=1`; it starts its own dev server on 3001,
so stop a hand-started one first). Baselines are committed `-win32` PNGs under
`__snapshots__/`, regenerated with the matching `:update` script only when the
change in appearance was the point. Rationale and the platform ruling:
`.scratch/frontend-quality/`.
