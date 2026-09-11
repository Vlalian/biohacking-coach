# The app moves to Next.js + React, with better-auth and Neon Postgres

Status: accepted (2026-07-16) · amended 2026-09-02, 2026-09-11

The POC (Express server, vanilla-JS frontend, localStorage persistence) needs a real backend: a database for athlete data, authentication in front of it, and vector search for the planned RAG (Knowledge Oracle). The deciding criterion was not technical taste but Mads's stated learning goal (2026-07-16): get good at directing LLM tools and agentic workflows, not at hand-coding. That inverts the old trade-off — "you'd write it yourself and learn" stops being a benefit, and AI-legibility becomes the dominant axis. React/TypeScript/Next.js is the most convention-heavy, best-documented, most AI-tool-supported stack available (it is what Lovable and v0 generate toward), so the React rewrite the POC frontend requires is done *by* agents rather than being a cost Mads pays by hand. better-auth is the consolidated open-source auth choice (Lucia retired, Passport dormant, Auth.js's maintainers joined better-auth and point new projects there); users live in our own Postgres. Neon provides that Postgres free at this scale, with pgvector included on every plan — the RAG store comes with the database. Everything is MIT-licensed and exportable; no vendor owns the users or the data.

Alternatives considered (full analysis in [.scratch/research/auth-and-backend-options.md](../../.scratch/research/auth-and-backend-options.md)): evolving the Express server lost its only advantage (learning-per-step) under the new goal, and its vanilla-JS UI is what AI tools handle worst. Supabase all-in remains the respectable runner-up (one vendor, bundled auth + realtime, Lovable's golden path). Clerk + Convex was rejected on points: no Postgres (RAG would live in a proprietary store with an unverified export path), two vendors, the thinnest AI training-data footprint, and its headline strength — live sync — solving a problem we established we don't have: the head coach reviews after the fact, so coach–athlete messaging is asynchronous (Mads, 2026-07-16; worth confirming with the domain expert). Async messaging on this stack is a messages table plus polling, upgradeable to SSE or a managed real-time service if ever needed; the component that actually makes messaging feel good — notifications when the app is closed — is extra work on every stack equally and is owed regardless.

## Consequences

- The vanilla-JS frontend is not ported; it becomes the *specification* (screens, flows, behavior) for a React rebuild. Lovable may be used for visual iteration via two-way GitHub sync, with Claude Code doing integration work in the same repo — that split is itself the agentic workflow being practiced.
- Server logic survives: prompt rendering, ~~the deterministic calc module,~~ **[corrected 2026-09-02 — the calc module is not a survivor; see the amendment below]** and Garmin `.fit`/`.gpx` parsing port as plain TypeScript modules (per the pure-core rule in `.scratch/research/codebase-structure-guidelines.md`), now called from Next.js API routes / server actions instead of Express routes.
- localStorage persistence (`bh_week_plan`, `bh_session_feedback`, …) is replaced by Postgres via an ORM; the entity refactor required by ADR 0002 happens as part of this migration, not before it.
- better-auth owns the auth schema in Neon; Garmin OAuth tokens get a home in the same database when that integration lands.
- Hosting: decided same day by [coach-eval ticket 04](../../.scratch/coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) — **Vercel Pro** ($20/mo; EU function region, DPA auto-incorporated on Pro — the free Hobby tier lacks both commercial use and the DPA). Neon's EU residency and DPA were verified the same day ([research](../../.scratch/research/postgres-host-eu-residency-dpa.md)): **Frankfurt region**, DPA auto-incorporated via the Databricks MCSA, pgvector free on all plans.
- **The eval-MVP builds on this stack directly** (Mads, 2026-07-16, "Option B"): this supersedes the coach-eval route's pre-charting lock to build on the hardened vanilla POC. The React rebuild sits between now and the coach evaluation, accepted to avoid hardening a frontend already decided against.
- The reference implementation for the whole shape is WebDevSimplified/video-blog-suggester-yt (pattern only — no license file, do not copy code).

## Amendment 2026-09-02 — The deterministic calc module was never a survivor; it is new construction

The Consequences list above names three things that "survive" the rewrite as plain TypeScript modules. Two of them did. **The deterministic calc module never existed to survive**, and the sentence has been struck through rather than deleted, because what was believed on 2026-07-16 is part of the record.

Checked in `poc/` while sequencing the rebuild (2026-07-16, [coach-eval route 08](../../.scratch/coach-eval-mvp-route/issues/08-adr-0005-names-a-module-that-does-not-exist.md)):

- `poc/public/js/rules.js` (55 lines) is the **Move rules** matrix — `isFrozen`, `classifyMove`. Pure, tested, and it genuinely did port: it is [`src/features/session/move-rules.ts`](../../src/features/session/move-rules.ts) today. But it is authority logic, not calculation.
- `poc/public/js/infodata.js` (343 lines) is a **seeded-PRNG synthetic data provider** for the Information View. Its own header calls it "the seam where real data sources plug in later". It fabricates data; it does not compute it.
- Nothing else in `poc/` computed training load, zones, or phase.

**What the two real survivors are:** prompt rendering (now `src/features/coach/prompts.ts`, and `prompt-blocks.ts` since the block model landed as PR #34) and Garmin `.fit`/`.gpx` parsing (`src/features/garmin/`). The Move rules are a third survivor and are named here as the Move rules, since the original bullet's third slot was occupied by something that was not one.

**The deterministic calculations module is planned new construction**, with MIT sources already vetted on 2026-07-09 (athlete-analytics for zones and training-load; formulas cross-checked against Coggan/TrainingPeaks definitions). That vetting is currently recorded only in the ticket that raised this correction — it has no file of its own in `.scratch/research/`, which is worth fixing before the module is built. The [eval-MVP PRD](../../.scratch/eval-mvp-build/PRD.md) has always recorded it under "Not a port" and excluded it from the port slices; only this ADR said otherwise.

**Still true 48 days later, and load-bearing.** [`build-dataset.ts`](../../src/features/information-view/build-dataset.ts) states it in its own doc comment: *"TSS-family values (tss, fitness, fatigue, form) stay null until the calc module exists — panels gated on them simply don't render."* So this is not a stale document detail. Several Information View panels are dark today for exactly this reason, and the module is still unwritten.

**Why the correction was worth making.** The likely failure was never confusion — it was invention. An agent that trusts this ADR goes looking for the calc module, finds `rules.js` or `infodata.js`, and ports one of them under that name. The second would be the worse outcome by far: a synthetic data generator adopted as the app's calculation layer would produce numbers that look like training load and are not.

**Unchanged by this amendment:** the stack decision itself, every alternative weighed, the hosting ruling, and the Option B supersession. This corrects one factual claim inside a consequence — it is not a change of decision.

## Amendment 2026-09-11 — Neon branch topology: production is reached only by production

The stack decision assumed one database. Neon's branching makes that false in a way that matters for health-adjacent data: a branch is a copy-on-write clone of its parent, and both the Neon↔Vercel integration's `vercel-dev` branch and its per-preview `preview/<git-branch>` branches were, by default, full copies of the `production` branch — so every preview URL and every agent worktree had been running against real athlete data. Verified 2026-09-11 with the Neon and Vercel CLIs; the two data-copy branches created that day were deleted the same day.

**Decision** (recorded as GDPR decision 8 in the tracker's `mvp/gdpr-decisions.md`; researched in `research/neon-vercel-platform-features.md`):

- `production` holds real data and is reached **only** by Vercel's Production environment, through a manually set `DATABASE_URL`.
- `seed-template` is a **schema-only** branch (structure, no rows) seeded once with `npm run seed`, and is the Neon **default branch**. The Neon-managed Vercel integration cuts every `preview/*` branch from the default branch, so previews get the seed accounts, never production rows. Proven with a git-triggered preview: parent `seed-template`, branch-scoped `DATABASE_URL` injected by the integration, build READY.
- `vercel-dev` (Vercel's Development env) and every worktree session's `dev/<name>` branch (`New-Session.ps1`, with a 14-day expiry; `Remove-Session.ps1` deletes eagerly) are children of `seed-template`.
- No branch is ever cut from `production`. Anonymized branches (Neon's `anon` extension) were considered and rejected: more setup for no gain at two users, and under an Art. 9 reading the training rows are the sensitive part, not only the name column.
- Erasure: a delete completes when Neon's history window has elapsed (6 h on the Free plan); the window is never raised above 7 days.

**Why it is an amendment here rather than a new ADR:** it changes no technology and adds none — it states how the already-chosen database is *laid out* so that the residency and minimisation reasons this ADR gave for choosing Neon actually hold in every environment, not just production.

**Enforced where:** in Neon (default branch = `seed-template`), the Vercel env vars (Production-only `DATABASE_URL`), and the session scripts. Not enforced: a human running `neon branches create --parent production` by hand. Branch-policy-as-code (`neon.ts` TTLs) is a follow-up.
