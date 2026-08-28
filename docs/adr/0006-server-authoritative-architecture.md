# The server owns the truth: Postgres is authoritative, the browser holds nothing durable

Status: accepted (2026-07-16) · amended 2026-08-25

The POC was localStorage-first — every module read and wrote browser `bh_*` keys, the Express server was a stateless Claude relay, and the privacy story was locality ("free-text never leaves the device"). Coached Mode ends that: an athlete's Tuesday rating must be visible to a Head Coach logging in from another machine that evening, which forces shared server state (already conceded in ADR 0003). Grilled 2026-07-16 (coach-eval ticket 03), we chose full server authority over local-first-with-sync or a hybrid split: the Postgres database (ADR 0005) is the single source of truth for sessions, streams, feedback, plans, coaching links, and visibility; the client reads and writes over an API and keeps only ephemeral UI state. The alternatives' constituencies had dissolved — "keep the POC's storage layer intact" died when the eval moved to the React rebuild (ADR 0005, Option B), and "the athlete wouldn't want it shared" was contradicted by the round-2 expert ("would share everything; wants everything in one place") — leaving sync/merge engineering cost with no stakeholder demanding it. A real multi-athlete roster on local-first means distributed sync per athlete; on server authority it is rows in a table.

The privacy posture translates rather than dies. Data handling is deliberately standard: managed Postgres in an EU region with provider encryption at rest and in transit, plus **identity separation** — login identity (name, email) lives in better-auth's tables while all training data is keyed by an opaque athlete ID, so a leak of the training data alone names no one. GDPR decision 1 (no real identity in prompts to Anthropic) carries forward unchanged at the prompt layer. End-to-end encryption was ruled out on product grounds: the AI Coach, the calc module, and the Head Coach all must read the data, so the server can never be key-blind. Application-level encryption of free-text fields remains an optional later bolt-on if a third party's genuinely sensitive text ever lands in the eval. Honesty replaces locality as the story: the consent artifact discloses server storage plainly — noting that a backed-up server is better custody than localStorage, whose browser-clear wipe was always an undisclosed data-loss risk.

## Consequences

- The React rebuild is written API-first from day one: no module reads `bh_*` keys; the store seam (`store.js`, `bh_stream_<id>`) becomes server endpoints backed by Drizzle/Postgres. The localStorage-era migration logic is not ported.
- Nothing durable is device-only: free-text, chat, and Garmin streams all live server-side, disclosed in the consent artifact. The browser keeps unsent drafts and view state only.
- The POC's enter-your-API-key-in-the-UI pattern is retired; the Anthropic key becomes a server secret (Tier-1 hardening item).
- No offline support in the eval: connection lost = the app says so and waits. A future phone client may add read-cache + write-queue without changing who owns the truth.
- The schema must enforce identity separation structurally: better-auth user rows link to athlete rows via opaque ID; training tables never carry email or name columns.
- A deletion path (data-subject rights) becomes a real server feature, owed before any third party joins; for the eval it can be an operator script.
- `gdpr-decisions.md` decisions 5, 6, and C still contradict current reality; their rewrite is owned by the route's GDPR posture item, which should cite this ADR.

## Amendment 2026-08-25 — The deletion path was never built, and it now gates the first invite

This ADR's Consequences list says *"a deletion path (data-subject rights) becomes a real server feature, owed before any third party joins; for the eval it can be an operator script."* Neither the feature nor the operator script exists. Checked by grep across `src/` on 2026-08-25: there is no account-deletion or erasure path of any kind.

The obligation was never in doubt — `docs/nfr.md` PRIV-3 and `gdpr-decisions.md` B both already required it, independently of this ADR. It was simply never implemented, and **nobody noticed until someone tried to use the product**: it surfaced in the 2026-08-21 live smoke run as [showable-version/10](../../.scratch/showable-version/issues/10-delete-my-account-and-data.md), not from any amount of re-reading the documents that specify it.

The clause "before any third party joins" is no longer a distant condition. [`.scratch/showable-version/MAP.md`](../../.scratch/showable-version/MAP.md) makes it a hard gate on step 10 (one login per tester), which is itself mandatory before an invite goes out. Inviting testers to a product that cannot forget them is the one thing on that route worse than shipping late.

Note also that this is **not** covered by the 2026-08-18 decision to tell testers about data handling in the invite email: telling someone what you do with their data is not the same as being able to delete it.

**Unchanged by this amendment:** server authority, identity separation by opaque athlete ID, the rejection of end-to-end encryption on product grounds, and the no-offline-support consequence. This records that one named consequence went unbuilt and has become a blocker — not a change of decision.
