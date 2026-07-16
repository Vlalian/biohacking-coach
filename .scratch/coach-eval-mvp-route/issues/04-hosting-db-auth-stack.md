Label: wayfinder:research
Status: ready-for-human

# Choose the hosting + database + auth stack

## Question

Concretely, what does the eval-MVP run on? These three cohere and should be decided together:

- **Hosting** — where the Express backend (and static client) deploys with HTTPS (e.g. Railway, Render, Fly, Hetzner VPS, or an all-in-one like Supabase). Must hold the server-side Anthropic key as a secret.
- **Database** — Postgres, hosted SQLite (Turso/LiteFS), or a batteries-included platform (Supabase = Postgres + Auth + hosting). Shaped by the [03 architecture](03-client-server-architecture.md) decision (server-authoritative needs a real shared DB; local-first-with-sync needs a sync-friendly store).
- **Auth** — two roles (athlete, Head Coach). Roll-your-own session cookies (fine for two seeded logins) vs. an auth provider (Supabase Auth, Clerk, Lucia, Auth.js). Weigh eval-simplicity against the standing principle (extend toward a real roster).

Bias toward the least operational overhead that still reaches the destination, and toward a stack the full product can grow on. `/research` the current options/tiers before the ballot.

**Added by [01 Anthropic data-processing facts](01-anthropic-data-processing-facts.md):** we are the **data Controller**, so whichever host/DB provider is chosen becomes a **second Processor and needs its own DPA** — make "offers a DPA, ideally auto-incorporated like Anthropic's, and states where it stores data" an explicit selection criterion, not an afterthought. Note EU residency is unavailable *at Anthropic*, but it very much is at most hosts — so the DB's residency is a real, cheap choice worth making deliberately (an EU-hosted DB keeps the stored data in the EU even though prompts transit to the US under SCCs).

## Amendment 2026-07-16 — substantially narrowed by ADR 0005

[ADR 0005](../../../docs/adr/0005-nextjs-better-auth-neon-stack.md) (decided in conversation, Mads Option B ruling: the eval builds on the new stack directly) settles two of the three coherent choices: **auth = better-auth** (roll-your-own and the provider list above are moot) and **database = Postgres** (Neon as the ADR's default). The framework is Next.js, replacing the Express-backend premise in the Hosting bullet.

What remains for this ticket:

- **Hosting** — deliberately deferred by the ADR: self-hosted Node (~$5/mo Railway/Fly/Hetzner) vs Vercel (free tier is non-commercial). Still shaped by [03](03-client-server-architecture.md).
- **Postgres host verification against this ticket's own criteria** — the auth/backend research (`.scratch/research/auth-and-backend-options.md`) explicitly flags **EU data residency as unverified for the candidates**. Before Neon is final: verify it offers an EU region, a DPA (ideally auto-incorporated), and a clear data-location statement — or pick another Postgres host that does (EU-hosted Supabase Postgres would satisfy this too, without adopting the rest of Supabase).

## Blocked by

03 — the architecture fork determines what the server must actually do.
