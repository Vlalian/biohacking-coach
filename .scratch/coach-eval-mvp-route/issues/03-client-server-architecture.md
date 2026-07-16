Label: wayfinder:grilling
Status: done
Assignee: Claude + Mads (grill session 2026-07-16)

# Decide the client↔server architecture

## Question

The vanilla POC is **localStorage-first**: every module reads and writes the browser's `bh_*` keys, and the Express server is a thin stateless Claude proxy. Sharing data between an athlete account and a Head-Coach account on two machines forces a shared server. How does the POC become a client of that server?

The foundational fork:

- **Server-authoritative** — the shared data (sessions, streams, feedback, plans, links, visibility) lives in the server database; the client reads/writes over an API. Clean multi-user story, straightforward Coached Mode; but it ends the "data never leaves the device" privacy posture and means rewiring the POC's storage layer.
- **Local-first with sync** — keep the on-device model, sync selected data up for sharing. Preserves more of the privacy-by-locality story and keeps the POC's storage layer intact; but sync/merge is genuinely hard, and shared coach state still has to be server-authoritative anyway.

Consider a hybrid line: personal/private data (free-text, raw streams) stays local-first; the shared coaching surface (calendar, prescribed sessions, Link-Visibility-gated Information View) is server-authoritative. Weigh against the standing principle (extend toward the full product) and the existing on-device privacy architecture (Privacy Proxy, SQLCipher intent).

Output: the architecture decision that gates the stack, the migration, and how much of the privacy story survives. May want a `/research` pass on local-first sync options before the ballot.

## Blocked by

None — takeable now.

## Resolution (grill session 2026-07-16, all ballots Mads)

**Server-authoritative** (option A), recorded as [ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md). Three ballots, all agreed:

1. **The fork: server-authoritative.** Postgres is the single source of truth for everything — sessions, streams, feedback, plans, links, visibility. The client holds nothing durable. Local-first/hybrid lost their remaining constituency: the "keep the POC storage layer" argument died with the Option B ruling (client is rebuilt anyway), and the athlete-privacy argument died in round 2 ("would share everything"). Data handling = **option 2 on the spectrum**: managed EU Postgres, provider encryption at rest/in transit, **identity separation** (login identity in better-auth's tables; training data keyed by opaque athlete ID, never email/name), and GDPR decision 1 (no real identity in prompts) carried forward unchanged at the prompt layer. E2EE ruled out (the AI Coach, calc module, and Head Coach must read the data). App-level field encryption of free-text = optional later bolt-on, not now.
2. **Nothing durable stays device-only.** Free-text goes to the server, disclosed honestly in the consent artifact. Browser keeps only ephemeral UI state. The POC's enter-your-API-key-in-the-UI habit dies here — the Anthropic key becomes a server secret.
3. **No offline support for the eval.** Connection lost = app says so and waits. A future phone product may add read-cache + write-queue on top without changing who owns the truth.

Noted for the GDPR fog item (not resolved here): the durability story flips — localStorage was fragile custody (browser-clear = history gone); server + backups is better custody, worth saying in the consent artifact. Deletion path = data-subject-rights duty. gdpr-decisions.md decisions 5/6/C still need their rewrite (owned by the GDPR posture item).
