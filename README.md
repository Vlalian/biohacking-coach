# Biohacking Coach

An AI coaching app for Ironman triathlon trainees. See **[ABOUT.md](ABOUT.md)** for the idea; this file covers running it.

> Work in progress, built in the open as a personal learning project.
> Licensed under PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE).

## Stack

- **Next.js 16** (App Router) + **React 19**
- **next-intl** — English / Danish
- **Postgres** via [Neon](https://neon.tech), **Drizzle ORM**
- **better-auth** for authentication
- **Vitest** for tests

## Prerequisites

- Node.js 20+
- A Postgres database (the project targets Neon in the EU / Frankfurt region)

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL
npm run db:migrate           # apply the schema
npm run seed                 # optional: seed sample data
```

`DATABASE_URL` must point at a **non-production** Neon branch. The project keeps real
athlete data on the `production` branch, reached only by Vercel's production
environment; everything else — local dev, agent worktrees, preview deployments —
runs on children of `seed-template`, a schema-only branch seeded once with the
sample accounts. `New-Session.ps1` creates such a branch per worktree; for a plain
checkout use `vercel-dev` or cut your own (`neon branches create --parent
seed-template`). Never cut a branch from `production`. See `.env.example` and GDPR
decision 8 in the tracker.

Migrations are applied by hand (`npm run db:migrate` reads `DATABASE_URL`), to
`seed-template` first — its children inherit the change — and to `production`
separately, **before** the code that needs the new columns is deployed. Gotcha: a
schema-only branch copies the `drizzle.__drizzle_migrations` table but not its
rows, so `db:migrate` on a fresh one tries migration 0000 and fails on the first
`CREATE TABLE`; copy the ledger rows from the parent first (done once for
`seed-template` on 2026-09-11 — children inherit them).

## Run

```bash
npm run dev                  # http://localhost:3001
```

## Other commands

```bash
npm run build                # production build
npm start                    # serve the production build
npm run lint                 # eslint
npm test                     # vitest
```

## Environment

Copy `.env.example` to `.env.local` and fill in the values. All `.env*` files are gitignored — never commit real credentials.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to view, study, and modify for **non-commercial** use.
