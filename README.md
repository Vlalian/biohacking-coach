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
