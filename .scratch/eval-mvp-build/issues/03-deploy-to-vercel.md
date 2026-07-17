Status: ready-for-agent
Label: wayfinder:task

# 03 — The skeleton is hosted and Mads logs into it from a browser

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

Deploy the authenticated skeleton to Vercel and confirm the whole path works from a real browser against a real URL: visit the deployment, sign in, see your own name (resolved from better-auth `user.name` through the athlete row — route 06).

This closes the tracer bullet. After this slice, every subsequent one lands on infrastructure that is already proven — which is the point of doing it now rather than at the end, when a hosting surprise would land on top of a finished app.

Functions run in an **EU region**, per [route ticket 04](../../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) — the Hobby tier was disqualified twice on DPA grounds, so this is Vercel **Pro**. Secrets (the Neon connection string, better-auth's secret) live in Vercel environment variables, never in the repo.

The Anthropic key is **not** part of this slice — nothing calls Claude yet. It becomes a server secret in slice 08.

## Acceptance criteria

- [ ] The app is deployed to Vercel Pro and reachable at a URL
- [ ] Functions are configured to an EU region
- [ ] Mads can sign in on the deployment from a browser and see his own name, read from `user.name` via his athlete row (route 06)
- [ ] The session survives a refresh against the deployed URL
- [ ] The database connection string and auth secret are Vercel environment variables; neither appears in the repo or in client-side code
- [ ] Pushing to `main` deploys; a pull request gets a preview deployment
- [ ] `OVERVIEW.md` records the deployment URL and where secrets live

## Blocked by

`.scratch/eval-mvp-build/issues/02-login-with-better-auth.md`

## Notes

**HITL:** needs a Vercel signup and **Pro at $20/mo** — [route ticket 04](../../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) called this the eval's only running cost. Both the Neon and Vercel DPAs should be concluded before real athlete data lands, which is slice 06 at the earliest.
