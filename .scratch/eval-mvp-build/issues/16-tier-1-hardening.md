Status: ready-for-agent
Label: wayfinder:task

# 16 — Tier-1 hardening: the doors are shut before the app is public

## Parent

`.scratch/eval-mvp-build/PRD.md`

## Sequencing — read this first

**Despite its number, this slice lands before [slice 03](03-deploy-to-vercel.md).** Numbers here are filing IDs: slices 01–14 were sequenced on 2026-07-16 with the GDPR and security slices deferred, and the PRD says they join "once those decisions lock". Both locked on 2026-07-17 ([route 09](../../coach-eval-mvp-route/issues/09-gdpr-posture.md) and [route 10](../../coach-eval-mvp-route/issues/10-security-hardening.md)), so they arrive last-numbered and early-ordered.

Slice 03 is where the app **becomes publicly reachable**. This slice is what makes that safe. It is small — most of route 10's checklist is a line of config each.

**Its sibling is [slice 15](15-consent-and-lawful-basis.md)** (consent + `inference_geo`), which gates [slice 06](06-garmin-upload-lands-real-data.md) where real data lands. Different gates, different slices: **16 guards the front door at 03; 15 guards real data at 06.**

## What to build

### 1. Registration is off on the deployment

```ts
emailAndPassword: { enabled: true, disableSignUp: <env-gated> }
```

Off on the deployment, **on locally and in tests** — [slice 02](02-login-with-better-auth.md)'s "a person can sign up" criterion still has to pass, it just passes locally now (route 10, ballot 1).

Why: slice 02 mints an athlete row per signup. An open form on a public URL, on an app that will hold health data, with nobody in the eval who needs it — **both real humans are seeded** (Mads by slice 02, the coach by [slice 11](11-coach-logs-in-and-sees-the-roster.md)), and slice 03 asks Mads to *sign in*.

**The trap this creates, and the reason this slice exists rather than a one-line PR:** with signup off, **the seed script is the only way an account can exist.** It must create accounts through **better-auth's own server API**, not by inserting `user` rows — hashing and record shape have to be what better-auth expects. Get it wrong and nobody can log in at all, on a deployment with no self-registration to escape through. Test the seeded login against the deployment, not just locally.

### 2. Anthropic workspace controls (HITL — Console)

On the **dedicated workspace** [slice 15](15-consent-and-lawful-basis.md) already requires for `allowed_inference_geos` — the same one, because Console limits **cannot be set on the default workspace**:

- **Spend limit**, set far below the Start tier's $500/month cap. The realistic bill is a few dollars; pick something like $25–50.
- **Workspace rate limits.**

No app-level rate limiter (route 10, ballot 2). The threat model after item 1 is two seeded accounts, and slice 08 already resolves every conversation from the authenticated session — so the realistic failure is a runaway loop, not an attacker, and a spend cap bounds that whatever the cause. **App-level per-user limiting is a V1 item**, for when registration opens and users are strangers. Do not build it here.

### 3. CORS and security headers

- **CORS** locked to the deployment's own origin.
- **Security headers**: CSP, HSTS, frame options, referrer policy.

### 4. FIT/GPX: file text is data, never instructions

The policy from route 10 ballot 3. **The defence already exists in `poc/garmin.js` and is undocumented — the point of writing it down is that the port must keep it deliberately rather than by luck:**

```js
function inferSessionType(sport = '') {
  return SPORT_MAP[sport.toLowerCase()] || 'Endurance';   // ← lookup + safe default
}
```

`sessionType` is the only file-derived field that reaches a prompt (`formatWeekActivity` / `formatSkippedSessions` interpolate it), and that lookup is why arbitrary `.fit` text cannot become one. **Do not "improve" it into a pass-through.** It reads like a limitation; it is a prompt-injection defence.

The rules:

- **Anything from a file that reaches a prompt goes through a lookup with a safe default** — this pattern, by name.
- **Raw file strings may be stored and displayed, never interpolated into prompt text.** Today `sport` and `note` (built as "Imported from Garmin · <sport>") hold raw file text and reach no prompt. Keep it that way — and note that adding session notes to a prompt is a *natural* product wish, so the test below is what stops it happening by accident.
- **Bound at the parse boundary**: cap `sport`'s length, strip control characters, so the database never holds arbitrary file text even in display-only columns.

Lands with [slice 06](06-garmin-upload-lands-real-data.md) if that slice is built first — it is rewriting this parser either way, and retrofitting costs more.

### Not this slice

- **The Anthropic key as a server secret** — decided by ADR 0006, built in [slice 08](08-weekly-session-conversation.md) where Claude is first called. (The POC takes `apiKey` from the request body on four routes; that pattern does not port.)
- **No identity in prompts** — [slice 15](15-consent-and-lawful-basis.md). Note it is *establishing* the rule, not preserving it: GDPR decision 1 was never implemented (corrected 2026-07-17).
- **HTTPS** — Vercel. **EU function region** — [slice 03](03-deploy-to-vercel.md), per route 04.

## Acceptance criteria

- [ ] `disableSignUp` is true on the deployment and false locally, driven by an environment variable
- [ ] The deployed URL offers no route by which a stranger can create an account — verified against the deployment, not by hiding a link
- [ ] Slice 02's signup criteria still pass locally and in tests
- [ ] The seed script creates accounts via better-auth's server API, and **a seeded user can sign in on the deployment** — the trap above, tested where it bites
- [ ] The Anthropic workspace has a spend limit set well below the tier cap, and workspace rate limits (HITL — Console; same workspace as slice 15's geo lock)
- [ ] CORS is locked to the deployment's own origin
- [ ] Security headers are set: CSP, HSTS, frame options, referrer policy
- [ ] Anything file-derived that reaches a prompt passes through a lookup with a safe default; `inferSessionType`'s pattern survives the port
- [ ] `sport` is length-capped and control-characters stripped at the parse boundary
- [ ] A regression test asserts no raw file string reaches prompt text
- [ ] No app-level rate limiter was built (V1 item — route 10 ballot 2)

## Blocked by

`.scratch/eval-mvp-build/issues/02-login-with-better-auth.md` — needs better-auth to exist before its signup can be switched off.

## Notes

**HITL:** the Console work. Both the spend limit and slice 15's `allowed_inference_geos` live on the same dedicated workspace — **and workspace geo is `"us"`-only and immutable after creation**, so create it once, deliberately.

**Do not re-litigate route 10's ballots.** They were briefed and ruled 2026-07-17. If the build finds one of them wrong — as the slice-01 review found routes 06, 07 and 08 wrong — file it; do not quietly decide otherwise.
