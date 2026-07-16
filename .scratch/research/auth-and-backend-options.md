# Backend & Auth Options — What's Realistic for This Project

Research notes, 2026-07-16. Grounded in primary sources (official docs, pricing pages, GitHub repos); every claim cites where it comes from, and pricing was fetched from the live pricing pages on this date. Written for a learning developer: jargon is explained the first time it appears. This brief presents trade-offs — it does not make the decision.

---

## The short version

Whatever gets chosen, three things are fixed by the project itself. First, **there must be a server** — a program running on a machine you or a provider controls, as opposed to code running in the athlete's browser. The Claude API key can never be shipped to the browser (anyone could read it and spend your money), so every Coach prompt must be relayed through server code, exactly as the POC's Express server does today. Second, **there must be a real database** — the POC stores everything in the browser's localStorage, which lives on one device and vanishes if the athlete clears their browser; athlete profiles, session history, and (in V1) Coached Mode's shared state need a database on the server. Third, **authentication** (proving which athlete is which, "auth" for short) only becomes meaningful once that database exists — it is the front door to it.

The backend question boils down to three shapes. **(a) Keep the current shape**: extend the Express server (or port it to a lighter modern equivalent like Hono), add a hosted Postgres database (Neon or Supabase give one free, including vector search for the planned RAG), and host the server for ~$5/month. Least new learning, most assembly. **(b) Next.js full-stack**: one framework serving both frontend and backend — the largest ecosystem and the smoothest pairing with modern auth libraries, but it would mean rewriting the vanilla-JS frontend in React, which is the biggest single cost on the table. **(c) Backend-as-a-service** (Supabase, Firebase, Convex): a provider runs the database, auth, and server functions for you — fastest to a working product, in exchange for coupling your code to their platform.

The auth question is more settled than it looks. Rolling your own is genuinely discouraged (the checklist of things to get right is long and every miss is a security hole). The open-source field has consolidated hard around **better-auth**: Lucia retired as a library, Passport's last release was 2023, and Auth.js's own maintainers joined the better-auth team in 2025 and now tell new projects to start with better-auth. The hosted alternative is **Clerk** (polished, generous free tier, but your users live in their system) — or simply using the auth built into Supabase/Firebase if one of those becomes the backend. The most common combinations for a project of this shape are covered in the pairing section at the end.

---

## What this project actually needs (from the repo, not assumptions)

- **Current stack**: an Express 4 server (`poc/server.js`, `express ^4.18.2` in [poc/package.json](../../poc/package.json)) that renders Coach prompts, calls the Anthropic API via `@anthropic-ai/sdk`, and parses Garmin `.fit`/`.gpx` uploads. Frontend is vanilla JS served by that server; persistence is browser localStorage ([poc/README.md](../../poc/README.md)).
- **Server-side LLM calls**: every Coach interaction goes through the server so the API key stays secret — any backend choice must run JavaScript/TypeScript server code (or force a rewrite of the prompt-rendering logic).
- **Database for athlete data**: Athlete Profile, Week Plans, Session Feedback, and Coached Mode (V1's "first feature requiring server-side shared state", per [CONTEXT.md](../../CONTEXT.md)).
- **RAG is planned** (the Knowledge Oracle). RAG — Retrieval-Augmented Generation — means storing training-science documents as *embeddings* (lists of numbers capturing meaning) and searching them by similarity. This needs a **vector store**; the cheapest path is Postgres with the **pgvector** extension, which some providers include free (noted per option below).
- **Garmin integration later**: Garmin's Connect Developer Program states "All APIs in the Developer Program use OAUTH 2.0" — OAuth being the standard protocol where a user grants your app access to their account on another service — and access requires an application Garmin reviews ("we will confirm the status of your application within two business days"); the program has "no licensing or maintenance fees ... but it is only for business use" ([Garmin program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/)). Any option below can do this; it just needs somewhere server-side to store each athlete's Garmin tokens (i.e., the database).
- **Deterministic calc module**: already decided as a plain tested module inside the server, exposed to the Coach via tool use — this ports to any of the JS backends unchanged.

---

## Backend options

### 1. Keep/extend the current Express server

**What it is**: Express is the long-standing minimal web framework for Node.js — it routes HTTP requests to your JavaScript functions and stays out of the way.

- **License & cost**: MIT (free). Latest stable is v5.2.1 (Dec 2025); the 4.x line the POC uses still gets maintenance releases (v4.22.2, May 2026) ([Express releases](https://github.com/expressjs/express/releases)).
- **Running cost**: Express itself is free but needs a host and a database. Render's free tier "spins down a Free web service that goes 15 minutes without receiving any inbound traffic" and takes "about one minute" to wake ([Render free tier docs](https://render.com/docs/free)) — noticeable for a coach app. Railway's Hobby plan is "$5/month with included usage" ([Railway pricing](https://railway.com/pricing)). For the database, Neon's free Postgres includes "0.5 GB/project" storage and "100 CU-hours/project" compute ([Neon pricing](https://neon.com/pricing)), and "pgvector is available on every Neon plan with no add-on or paid tier required" ([Neon pgvector docs](https://neon.com/docs/extensions/pgvector)).
- **Lock-in risk**: essentially none. Plain Node code runs anywhere; a Postgres database exports with standard tools; switching hosts is an afternoon.
- **Maintenance burden**: you assemble everything — database access, auth, input validation, deployment — from parts. Each part is well-documented, but the integration work is yours, and so is keeping dependencies updated.
- **Maturity**: the most battle-tested option on the list; also the least modern (no built-in TypeScript story, callback-era APIs). "Boring" in the good sense.
- **Fit here**: strongest continuity — the prompt-rendering, calc-module, and Garmin-parsing code already lives in this shape. Adding Postgres + an auth library evolves the POC rather than replacing it. The vanilla-JS frontend stays as-is.

**Pros**: zero rewrite; no platform dependence; cheapest to leave; everything transferable to any future stack.
**Cons**: most manual assembly; no free always-on hosting; you own every integration decision (which is also how you learn them).

### 2. Next.js full-stack

**What it is**: Next.js is a React framework where one project contains both the frontend pages and the backend endpoints ("API routes" — server functions reachable over HTTP — and "server actions" — server functions callable directly from React components).

- **License & cost**: MIT, 141k GitHub stars ([vercel/next.js](https://github.com/vercel/next.js)); current docs are for v16.2.x ([Next.js deploying docs](https://nextjs.org/docs/app/getting-started/deploying)). Hosting on Vercel (the company behind Next.js): the free Hobby plan is "for personal, non-commercial use" per their FAQ, with 1M function invocations and 100 GB data transfer/month; the Pro plan is "$20/user/month" ([Vercel pricing](https://vercel.com/pricing)). Crucially, Vercel is optional: "Next.js can be deployed as a Node.js server, Docker container, static export" and "Node.js deployments support all Next.js features" ([deploying docs](https://nextjs.org/docs/app/getting-started/deploying)) — so the $5/month hosts from option 1 work too.
- **Lock-in risk**: low on hosting (self-hostable, MIT). Moderate on code shape: server actions and React server components are Next.js idioms — the calc module and prompt logic stay portable if kept in plain modules, per the pure-core rule in [codebase-structure-guidelines.md](codebase-structure-guidelines.md).
- **Maintenance burden**: one framework instead of separate frontend/backend, and the largest ecosystem of tutorials, templates, and auth integrations in the JS world. The flip side: Next.js moves fast and major versions bring real migration work.
- **Maturity**: the dominant React framework; very actively developed.
- **Fit here**: the hidden cost is the frontend. The POC is vanilla JS; Next.js means React, which means **rewriting the UI** — calendar, drawers, Weekly Session flow — and learning React itself. The backend half (API routes calling Claude, Postgres via Neon/Supabase) fits fine. Worth choosing only if a React rewrite is wanted anyway (e.g., for the component ecosystem, or for React Native later).
- **Database**: none included — same Neon/Supabase Postgres as option 1.

**Pros**: one codebase for everything; best-supported target for every auth option below; huge ecosystem; free non-commercial hosting.
**Cons**: requires learning React and rewriting the working POC frontend; fast-moving framework; "non-commercial" free hosting is a real limit if the app takes payments later.

### 3. Hono (lightweight modern framework)

**What it is**: Hono is a small, modern, TypeScript-first web framework "built on Web Standards" that runs on Node.js, Bun, Cloudflare Workers, Deno, and AWS Lambda ([honojs/hono](https://github.com/honojs/hono)).

- **License & cost**: MIT, 31k stars; very actively released — v4.12.30 shipped 2026-07-13, with several releases per month ([Hono releases](https://github.com/honojs/hono/releases)). Free; same hosting and database story as Express (option 1).
- **Lock-in risk**: none meaningful — it is deliberately portable across runtimes, and its request/response handling uses web standards rather than framework-specific objects.
- **Maintenance burden**: like Express, you assemble the parts yourself. Slightly less material online than Express (younger project), but first-class TypeScript and modern middleware reduce foot-guns.
- **Maturity**: young but heavily adopted and fast-moving; the de-facto "modern Express".
- **Fit here**: a port of `server.js` from Express to Hono would be mechanical (routes map one-to-one). The gain is TypeScript-native ergonomics and the option to later run on cheap edge runtimes; the cost is a port that delivers no user-visible feature. Reasonable to fold into a TypeScript migration if one happens; not worth doing alone.

**Pros**: modern, tiny, portable, TypeScript-first; keeps the "own everything" freedom of option 1.
**Cons**: a rewrite with no feature payoff by itself; smaller body of examples than Express/Next.js.

### 4. Supabase (backend-as-a-service, Postgres-based)

**What it is**: A hosted platform bundling a real Postgres database, authentication, file storage, and server functions — "backend-as-a-service" (BaaS) means the provider runs the backend infrastructure and you call it from your code.

- **License & cost**: the platform's components are open source; the hosted service's free tier gives 2 active projects, "500 MB database size", "50,000 monthly active users" for auth, and 5 GB egress — but "Free projects are paused after 1 week of inactivity". Pro is "$25/month" with 100k MAU, 8 GB disk, and no auto-pausing ([Supabase pricing](https://supabase.com/pricing)). ("MAU" = monthly active users — distinct people who sign in during a month.)
- **Lock-in risk**: the lowest of the BaaS options, because the core is plain Postgres — "storing user data and other Auth information in a special schema" in *your* project's database ([Supabase Auth docs](https://supabase.com/docs/guides/auth)), exportable with standard Postgres tooling. Code written against Supabase's client SDK and row-level security would still need rework to leave.
- **Maintenance burden**: low — database, auth, and backups are managed. The concepts to learn are Postgres itself and RLS ("row level security" — access rules enforced inside the database per row).
- **Maturity**: established, large ecosystem.
- **Fit here**: strong. Postgres for athlete data, pgvector included for RAG — "store embeddings and perform vector similarity search ... particularly useful if you're building AI applications with large language models ... for retrieval augmented generation (RAG)" ([Supabase pgvector docs](https://supabase.com/docs/guides/database/extensions/pgvector)) — and auth built in. One important caveat: Supabase's Edge Functions (its server-code offering) run Deno, not Node, so the existing Express code doesn't move there as-is. The pragmatic pattern is **Supabase as database+auth, keeping your own small Node server** (option 1 or 3) for the Claude calls and calc module.
- **The free-tier pause** matters for a solo project that sits idle between build sessions: the database stops responding until manually restored.

**Pros**: real Postgres you own and can export; pgvector free; auth included; generous free tier for actual usage.
**Cons**: free projects pause after a week idle; server functions are Deno (existing Node code stays elsewhere); platform SDK habits create soft lock-in.

### 5. Firebase (backend-as-a-service, Google)

**What it is**: Google's BaaS — the Firestore NoSQL database (documents, not tables — no SQL, no joins), Firebase Auth, hosting, and Cloud Functions.

- **License & cost**: free Spark plan: auth "50K MAUs", Firestore "1 GiB total" with "50K reads/day" / "20K writes/day", Cloud Functions "2M/month" invocations; the Blaze plan is pay-as-you-go beyond that (e.g., "$0.40/million" further invocations) ([Firebase pricing](https://firebase.google.com/pricing)).
- **Lock-in risk**: the highest here. Firestore is proprietary and document-shaped — data modelled for it does not translate directly to Postgres, and there is no pgvector. Auth users *are* exportable: the CLI provides `auth:export` / `auth:import` ([Firebase CLI auth docs](https://firebase.google.com/docs/cli/auth)).
- **Maintenance burden**: low day-to-day; the real cost is learning to model relational-feeling data (athletes → weeks → sessions → reflections) in a document store, and living with per-read/per-write billing.
- **Maturity**: very mature, huge docs base.
- **Fit here**: weakest fit of the three BaaS options. The app's data is relational (calendar weeks, sessions, feedback joined every Weekly Session), the RAG plan wants a vector-capable store (not verified as available in Firestore during this research), and nothing in the current stack points toward Google's ecosystem.

**Pros**: generous free tier; Google-scale reliability; auth included and exportable.
**Cons**: NoSQL mismatch with this relational domain; no Postgres/pgvector; deepest ecosystem lock-in; pay-per-operation pricing is hard to predict.

### 6. Convex (backend-as-a-service, TypeScript-native)

**What it is**: "The open-source reactive database for app developers" ([get-convex/convex-backend](https://github.com/get-convex/convex-backend)) — you write TypeScript functions (queries/mutations/actions) that run on Convex's servers against its own database, and frontends subscribe to results that update live.

- **License & cost**: the backend is source-available under FSL-1.1-Apache-2.0 — a "delayed open source" license that forbids building a competing service but "automatically converts to Apache 2.0 on the second anniversary of the software's release" ([Convex LICENSE](https://github.com/get-convex/convex-backend/blob/main/LICENSE.md)). Hosted free tier: "1M" function calls and "0.5 GB" storage included; Professional is "$25 per developer/month" with 25M calls and 50 GB ([Convex pricing](https://www.convex.dev/pricing)).
- **Lock-in risk**: moderate-high. Your backend logic is written as Convex functions against Convex's database — portable only by rewriting. Self-hosting the open backend is possible but is real ops work, the opposite of why one picks a BaaS.
- **Maintenance burden**: low once learned — no servers, no migrations in the SQL sense, end-to-end TypeScript types. But it is its own programming model to learn (queries vs mutations vs actions, reactivity rules).
- **Maturity**: newer and smaller than Supabase/Firebase (12k stars); moving quickly.
- **Fit here**: mixed. Native vector search exists — "Vector search allows you to find Convex documents similar to a provided vector", dimensions "between 2 and 4096", searchable only from actions ([Convex vector search docs](https://docs.convex.dev/search/vector-search)) — so RAG is covered without Postgres. The live-updating model shines for collaborative UIs (interesting for Coached Mode's shared athlete/Head-Coach state). Against that: the whole POC backend would be rewritten as Convex functions, the frontend story is React-first (another push toward a React rewrite), and the auth story leans on third parties (see Convex Auth below).

**Pros**: end-to-end TypeScript; real-time updates suit Coached Mode; vector search built in; no infrastructure to manage.
**Cons**: full backend rewrite into a proprietary programming model; React-oriented; own auth is beta; smallest community of the BaaS trio; FSL license is not plain open source until each release ages two years.

---

## Auth options

### 0. Roll-your-own (sessions/JWT) — and why it's discouraged

**What it is**: writing your own login: storing password hashes, issuing either **sessions** (a random ID in a cookie, looked up server-side) or **JWTs** (JSON Web Tokens — signed tokens the server can verify without a lookup).

The reason this is near-universally discouraged is the breadth of what must *all* be correct. OWASP (the Open Worldwide Application Security Project, the standard reference for web security) requires, among much else: "Session identifiers must have at least 64 bits of entropy to prevent brute-force session guessing attacks"; cookies must carry `Secure`, `HttpOnly` ("instructs web browsers not to allow scripts ... access the cookies"), and `SameSite` attributes; and "the session ID must be renewed or regenerated by the web application after any privilege level change" — plus server-side idle/absolute timeouts and full-session HTTPS ([OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)). Add password hashing, reset flows, email verification, OAuth token exchange for Garmin/social login, and rate limiting — every item a library gives you for free, and every miss a hole. For a solo non-security-specialist, the realistic version of "roll your own" is "ship several of these gaps without knowing it".

**Pros**: zero dependencies; maximal learning.
**Cons**: security-critical checklist with no safety net; ongoing burden as attacks evolve; re-implements exactly what better-auth ships.

### 1. better-auth (open-source library — currently the field's default)

**What it is**: "a framework-agnostic, universal authentication and authorization framework for TypeScript" ([better-auth docs](https://www.better-auth.com/docs/introduction)) — a library you run inside your own server, storing users in your own database.

- **License & cost**: MIT, free, 29k stars ([better-auth repo](https://github.com/better-auth/better-auth)). No hosted service to pay for.
- **Versions/stability**: latest stable is **v1.6.23 (2026-06-29)**; the **v1.7.0 line is still in release candidate** (v1.7.0-rc.1, 2026-07-02) and carries breaking changes (OAuth provider changes, 2FA redesign) ([releases](https://github.com/better-auth/better-auth/releases)). Practical note: pin 1.6.x today, or wait for 1.7.0 stable before adopting, and read the migration guide either way. The project is very young (created May 2024) but releases weekly and has consolidated the ecosystem around it (see Auth.js below). In July 2026 the team **joined Vercel**, stating "Vercel shares our commitment to keeping auth open source, framework and platform agnostic" ([announcement](https://better-auth.com/blog/better-auth-joins-vercel)) — funding security for the project, with the obvious caveat that its center of gravity is now a hosting company.
- **Requirements**: a JS/TS server plus a database — "Better Auth connects to a database to store data ... such as users, sessions, and more", with a built-in adapter covering SQLite, PostgreSQL, MySQL, and MSSQL, plus Drizzle/Prisma ORM and MongoDB support ([database docs](https://www.better-auth.com/docs/concepts/database)). Features in the box: email/password, social sign-on, two-factor auth, rate limiting, and a plugin ecosystem ([introduction](https://www.better-auth.com/docs/introduction)).
- **Lock-in risk**: minimal — users, sessions, and OAuth tokens live in *your* Postgres tables. Dropping the library later leaves the data behind in standard form.
- **Maintenance burden**: moderate. You run it: schema migrations when the library updates, version bumps, configuring providers. Far less than roll-your-own; more than a hosted service.
- **Fit here**: strong with options 1–3 (it's the natural companion to Express/Hono/Next.js + Postgres), and its `account` table already models OAuth provider tokens — the same mechanism a Garmin connection needs. This is the stack seen in the reference repo on the radar (better-auth + Drizzle + Neon + Next.js), but nothing about it requires Next.js.

**Pros**: free, MIT, own-your-data; feature-complete (2FA, social, plugins); the direction the whole JS auth ecosystem is converging on; works with the current Express server.
**Cons**: young project moving fast (1.7 RC with breaking changes); you operate it yourself; requires adding a database first (which this project needs anyway).

### 2. Auth.js / NextAuth (open-source library — now in maintenance orbit)

**What it is**: the long-standing open-source auth library for Next.js (as NextAuth), later generalised to SvelteKit, Express, and Qwik as Auth.js ([authjs.dev](https://authjs.dev/getting-started)).

- **Status — the decisive fact**: v5 has sat in beta for a long time ("next-auth@5.0.0-beta and later" is what the docs cover, ibid.), and in September 2025 the team joined better-auth: existing users "can continue doing so without disruption — we'll keep addressing security patches and urgent issues", but "We strongly recommend new projects to start with Better Auth" ([Auth.js joins Better Auth](https://better-auth.com/blog/authjs-joins-better-auth)).
- **Fit here**: for a *new* adoption, its own maintainers point elsewhere. Only relevant if a tutorial being followed uses it — in which case translate to better-auth.

**Pros**: proven, huge install base, still patched.
**Cons**: new-project recommendation is explicitly "use better-auth instead", straight from its own maintainers; v5 never left beta.

### 3. Passport (open-source library — the old guard)

**What it is**: "Simple, unobtrusive authentication for Node.js" — Express middleware with hundreds of pluggable "strategies" (one per login provider) ([npm](https://registry.npmjs.org/passport/latest)).

- **Status**: MIT, version 0.7.0, published **November 2023** — no release since ([npm registry data](https://registry.npmjs.org/passport)). It also only solves the *verify a login* step: sessions, user storage, password hashing, reset flows, and 2FA are all still yours to build, putting you halfway back into roll-your-own territory.
- **Fit here**: hard to justify for a new build in 2026 given better-auth covers the same ground plus everything Passport leaves out.

**Pros**: enormous strategy catalogue; deeply proven; zero magic.
**Cons**: effectively dormant (last release 2023); only a fragment of an auth system; better-auth supersedes it for this use case.

### 4. Lucia (status check — retired as a library)

Lucia is no longer an auth library to install. The site now describes it as "an open source project to provide resources on implementing authentication using JavaScript and TypeScript" ([lucia-auth.com](https://lucia-auth.com)) — i.e., a learning resource, with its companion pieces (Arctic for OAuth, Oslo for crypto) living on as small utilities. **Not a candidate**; valuable reading if you ever want to understand what the libraries do under the hood.

### 5. Clerk (hosted service)

**What it is**: a hosted auth provider with prebuilt sign-in/sign-up UI components — your app embeds their widgets and their servers hold the user accounts.

- **Cost**: free tier: "50,000 MRU (monthly retained user) limit per app" with prebuilt UIs and custom domain, but **no MFA, no passkeys, and Clerk branding stays**. Pro: "$25/mo" (or $20 annually), "50,000 MRUs included per app, then $0.02/mo each", unlocking branding removal and MFA ([Clerk pricing](https://clerk.com/pricing)). (An "MRU" is Clerk's billing unit — a returning user in a month.)
- **Lock-in risk**: your users live in Clerk's database, not yours — the classic hosted-auth trade. Mitigation exists: the dashboard exports "a CSV file containing a list of their application's users that includes their hashed passwords" ([Clerk export docs](https://clerk.com/docs/deployments/exporting-users)), so migration off is possible, though the integration code (their React components and SDK calls throughout the app) is the stickier part. Pricing-change risk is real for any hosted service; the export path is the insurance.
- **Maintenance burden**: the lowest of any option — no schema, no password handling, professional login UI in minutes.
- **Fit here**: Clerk is React-first — its prebuilt components are React components, which is why it's "easiest with Next.js" and why the Coding Sloth pairing was Clerk + Convex. With the current vanilla-JS frontend it's possible (they have a plain JS SDK) but you'd be off the golden path. Note also: Clerk authenticates *your* users; the Garmin OAuth connection is a separate integration you build server-side regardless.

**Pros**: fastest professional-grade auth; MFA/passkeys/ban tooling on paid tier; genuinely generous free tier; user export exists.
**Cons**: users live off-site; monthly cost at scale; React-shaped — pulls toward a Next.js/React frontend; a second vendor dependency alongside your database.

### 6. Auth0 (hosted service)

**What it is**: the enterprise-grade hosted identity platform (now Okta-owned).

- **Cost**: free "Up to 25,000 monthly active users" with one custom domain; first paid tier "Essentials — from $35/month" for consumer apps (from $150/month for B2B) ([Auth0 pricing](https://auth0.com/pricing)).
- **Fit here**: aimed at organisations with compliance requirements; configuration surface is large for a solo project, and the paid step is steeper than Clerk's. Same lock-in shape as Clerk (users hosted off-site). Listed for completeness; nothing about this project points to it over Clerk.

**Pros**: big free MAU allowance; enterprise features when/if ever needed.
**Cons**: heavyweight for a solo app; paid tier from $35/mo; hosted lock-in.

### 7. Supabase Auth (hosted, bundled with Supabase)

**What it is**: the auth system included in every Supabase project — "client SDKs and API endpoints to help you create and manage users" supporting email/password, magic links, 19+ social OAuth providers, and phone login ([Supabase Auth docs](https://supabase.com/docs/guides/auth)).

- **Cost**: included — 50,000 MAU on the free tier, 100,000 on Pro ([Supabase pricing](https://supabase.com/pricing)).
- **Lock-in risk**: notably better than other hosted auth: it "uses your project's Postgres database under the hood, storing user data and other Auth information in a special schema" ([Auth docs](https://supabase.com/docs/guides/auth)) — the accounts sit in a Postgres database you can dump wholesale.
- **Fit here**: only makes sense *with* Supabase as the database — but if Supabase is the database (a strong candidate per Backend §4), taking its auth is the path of least resistance and keeps vendor count at one. Its row-level security ties access rules to the athlete's identity inside the database itself, which maps cleanly onto Link Visibility-style per-athlete data boundaries.

**Pros**: zero extra cost or vendor; users in your own Postgres; RLS integration for per-athlete access rules.
**Cons**: coupled to choosing Supabase; free-tier project pausing applies to auth too.

### 8. Firebase Auth (hosted, bundled with Firebase)

**What it is**: Google's hosted auth — "50K MAUs" free on the Spark plan ([Firebase pricing](https://firebase.google.com/pricing)), with CLI `auth:export`/`auth:import` for getting accounts out ([Firebase CLI docs](https://firebase.google.com/docs/cli/auth)).

- **Fit here**: usable from any backend in principle, but its value is as part of the Firebase bundle — and Backend §5 concluded that bundle fits this project's relational, Postgres-leaning, RAG-bound data poorly. If Firebase isn't the backend, Firebase Auth alone offers nothing better-auth or Clerk doesn't.

**Pros**: free at this project's scale; mature; exportable.
**Cons**: only compelling inside the Firebase ecosystem.

---

## Which auth goes with which backend

| Backend choice | Natural auth fit | Also works | Awkward |
|---|---|---|---|
| **Express (extended)** | better-auth (framework-agnostic, users in your Postgres) | Clerk (plain-JS SDK, off golden path); Supabase Auth if Supabase is the DB | Auth.js (maintenance mode), Passport (dormant) |
| **Hono** | better-auth | Clerk | — |
| **Next.js full-stack** | better-auth or Clerk — both first-class here | Auth.js (works, but its maintainers say start with better-auth) | — |
| **Supabase** | Supabase Auth (included, users in your own Postgres) | better-auth pointed at the Supabase Postgres | Clerk (second vendor for what's already included) |
| **Firebase** | Firebase Auth (included) | — | anything else (fights the bundle) |
| **Convex** | Clerk — Convex's own docs recommend it, noting third-party integrations add "passkeys, two-factor auth, spam protection" | Convex Auth (first-party, but "in beta ... may change in backward-incompatible ways"); Auth0; WorkOS ([Convex auth docs](https://docs.convex.dev/auth)) | better-auth (Convex isn't a SQL database it can own tables in) |

**The combinations most commonly chosen for a project of this shape** (solo developer, needs a relational database anyway, server-side LLM calls, RAG on the roadmap):

1. **Existing server + Postgres + better-auth** — Express (or Hono) + Neon/Supabase Postgres + better-auth. Evolves the POC instead of replacing it; every piece is MIT/exportable; pgvector for RAG comes free with either Postgres host. The most learning-per-step, the least throwaway work.
2. **Next.js + better-auth + Neon** — the pattern in the reference repo already on the radar. Same ownership story as (1), plus the biggest ecosystem — at the price of a React rewrite of the frontend.
3. **Supabase all-in** — database + auth + pgvector from one vendor at $0–25/month, with your own Node server kept for Claude calls and the calc module. Least assembly; mild platform coupling; mind the free-tier pause.
4. **Clerk + Convex** — the Coding Sloth pairing. Fastest polished auth and a real-time backend that would suit Coached Mode — but it means a React frontend, a full backend rewrite into Convex's model, two vendors, and no Postgres.

The real fork in the road is not auth (better-auth vs "whatever the chosen platform bundles" covers nearly every path) — it is **whether the vanilla-JS frontend gets rewritten in React**. Options 2 and 4 require it; options 1 and 3 don't.

---

## Sources

**Backend frameworks & hosting**
- Express releases — https://github.com/expressjs/express/releases
- Next.js repo (MIT, stars) — https://github.com/vercel/next.js
- Next.js deployment/self-hosting docs — https://nextjs.org/docs/app/getting-started/deploying
- Vercel pricing — https://vercel.com/pricing
- Hono repo — https://github.com/honojs/hono and releases — https://github.com/honojs/hono/releases
- Render free tier — https://render.com/docs/free
- Railway pricing — https://railway.com/pricing

**Databases / BaaS**
- Neon pricing — https://neon.com/pricing ; Neon pgvector — https://neon.com/docs/extensions/pgvector
- Supabase pricing — https://supabase.com/pricing ; pgvector — https://supabase.com/docs/guides/database/extensions/pgvector
- Firebase pricing — https://firebase.google.com/pricing ; CLI auth export — https://firebase.google.com/docs/cli/auth
- Convex pricing — https://www.convex.dev/pricing ; backend repo/license — https://github.com/get-convex/convex-backend and https://github.com/get-convex/convex-backend/blob/main/LICENSE.md ; vector search — https://docs.convex.dev/search/vector-search ; auth options — https://docs.convex.dev/auth

**Auth**
- OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- better-auth introduction — https://www.better-auth.com/docs/introduction ; database concepts — https://www.better-auth.com/docs/concepts/database ; repo — https://github.com/better-auth/better-auth ; releases — https://github.com/better-auth/better-auth/releases ; Vercel announcement — https://better-auth.com/blog/better-auth-joins-vercel ; Auth.js announcement — https://better-auth.com/blog/authjs-joins-better-auth
- Auth.js getting started — https://authjs.dev/getting-started
- Passport npm — https://registry.npmjs.org/passport
- Lucia — https://lucia-auth.com
- Clerk pricing — https://clerk.com/pricing ; user export — https://clerk.com/docs/deployments/exporting-users
- Auth0 pricing — https://auth0.com/pricing
- Supabase Auth — https://supabase.com/docs/guides/auth

**Integrations**
- Garmin Connect Developer Program FAQ (OAuth 2.0, approval, fees) — https://developer.garmin.com/gc-developer-program/program-faq/ ; overview — https://developer.garmin.com/gc-developer-program/overview/

*Unverified / deliberately not claimed*: Firestore's vector-search capability (not checked against Firebase docs); Convex's data-export tooling; per-provider EU data-residency options (relevant to the GDPR track — worth its own check when a shortlist exists).
