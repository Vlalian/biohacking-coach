Label: wayfinder:grilling
Status: done
Assignee: Claude + Mads (grill session 2026-07-17)

# Tier-1 security hardening, consolidated

Map: ../MAP.md

## Question

Graduated from the map's **Not yet specified** section on 2026-07-17. It was waiting on the stack, which is chosen ([ADR 0005](../../../docs/adr/0005-nextjs-better-auth-neon-stack.md), [ticket 04](04-hosting-db-auth-stack.md)). It is the **last item in the map's fog**, and the last decision standing between the build and a clean run.

Fold the enumerated Tier-1 items into one decision and a checklist a build slice can execute.

## It gates slice 03, not slice 06

The map and the [eval-MVP PRD](../../eval-mvp-build/PRD.md) both say this item gates [slice 06](../../eval-mvp-build/issues/06-garmin-upload-lands-real-data.md), where real Garmin data first lands. **That is too late.** Traced 2026-07-17:

- [Slice 02](../../eval-mvp-build/issues/02-login-with-better-auth.md) rules that **signing up creates an athlete row**, and explicitly parks a question: *"whether the registration route is reachable on the public deployment is a different question... belongs to the route's still-open security hardening item — do not answer it here."*
- [Slice 03](../../eval-mvp-build/issues/03-deploy-to-vercel.md) then **deploys to a public URL with that signup route on it** — and does not mention this item at all.

So the moment 03 lands, anyone who finds the URL can register and mint an athlete row. The stakes are low (synthetic data only, and the PRD explicitly permits building and demoing against synthetic data while this is open) but the door is open, nobody downstream closes it, and it is cheapest to answer before 03 rather than after.

**The PRD's gate wording needs amending with this ruling**: real data and coach access are gated at 06, but *public reachability* starts at 03.

## Already decided — do not re-litigate

- **The Anthropic key becomes a server secret.** [ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md): "The POC's enter-your-API-key-in-the-UI pattern is retired." Confirmed in the code — `poc/server.js` takes `apiKey` **from the request body** on four routes (`/coach`, `/weekly`, `/briefing`, `/chat`), i.e. the browser holds and sends it. That pattern does not port. Decided; it is [slice 08](../../eval-mvp-build/issues/08-weekly-session-conversation.md)'s build work, not a ballot here.
- **HTTPS** — Vercel provides it. Not a decision.
- **EU function region** — [ticket 04](04-hosting-db-auth-stack.md). Decided.
- **No real identity in prompts** — GDPR decision 1, and [09](09-gdpr-posture.md) made it load-bearing for the *lawful basis*, not just prompt hygiene: it is what keeps the DPA's "special categories: None" mismatch small. ~~Defend it through the port; not a ballot.~~ **Corrected during the grill:** there is nothing to defend — decision 1 was never implemented, and the POC sends `athlete=<name>`. The port must **establish** it. Still not a ballot; see *Raised by this grill* in the Resolution.

## Tasks, not decisions — for the checklist

- **CORS lockdown** to the deployment's own origin. (Note: [01](01-anthropic-data-processing-facts.md) flagged that ZDR organisations cannot use CORS at all — moot now that [09](09-gdpr-posture.md) skipped ZDR, and the conclusion held anyway: the server-side key requires the proxy regardless.)
- **Security headers** — CSP, HSTS, frame options, referrer policy.
- **Secrets in Vercel environment variables**, never the repo — already a slice 03 criterion.

## What actually needs deciding

### Ballot 1 — is the registration route reachable on the public deployment?

The one that bites at slice 03. Slice 02 mints an athlete row on signup, so an open form on a public URL holding health-adjacent data is a liability the eval gains nothing from — there are exactly two intended users, and **the coach is seeded, not self-registered** ([05](05-server-data-model.md) ballot 1, [slice 11](../../eval-mvp-build/issues/11-coach-logs-in-and-sees-the-roster.md)).

Options to brief: leave registration open; put it behind an invite code or an email allowlist; disable the route on the deployment entirely and seed both accounts. Each has a cost in what the eval can still demonstrate — an invite flow was explicitly deferred by [ticket 02](02-coached-mode-mvp-scope.md), and disabling registration means slice 02's signup path is only ever exercised locally, which weakens what slice 03's tracer bullet actually proves.

### Ballot 2 — rate limiting on Claude-calling routes

Two distinct worries, and they want separating before the ballot: **cost** (an open endpoint that calls a paid API is a bill someone else can run up) and **abuse**. With registration closed (ballot 1) the exposure shrinks a lot — which is why this is downstream of it. Decide whether the eval needs real limits or whether an authenticated-only route plus a spend cap is proportionate for two users.

### Ballot 3 — FIT/GPX metadata sanitisation

The prompt-injection surface. A `.fit` file carries file-controlled strings — `poc/public/js/garmin-import.js` lifts `sport` and `note` straight out of the parsed file, and the [signed-off schema](05-server-data-model.md) stores `sport`, `title`, and a `summary` JSONB on `sessions`. ~~Those columns reach a prompt in [slice 08](../../eval-mvp-build/issues/08-weekly-session-conversation.md).~~

**Corrected during the grill — this sentence was asserted without checking, which is the same fault the session's [AGENTS.md rule](../../../AGENTS.md) now guards against.** Those columns do **not** reach a prompt. `buildWeeklyContext` passes `sessionType`, dates and numeric feedback; `formatWeekActivity` / `formatSkippedSessions` / `detectPatterns` use `sessionType` only. And `sessionType` is laundered through `inferSessionType`'s lookup with a safe default, so file text cannot become one. `summary` is computed from records — numbers. See the Resolution for what this changes: the eval is not at risk, and the real exposure is the port silently deleting a defence it does not recognise.

For the eval, the files are Mads's own, off his own watch — so the realistic risk is close to zero and the honest question is whether to spend anything on it now. But it is a genuine surface at V1 (an athlete uploads a file they were given), and the cheap version — treat file-derived strings as data, never as instructions; strip or bound them before they enter a prompt — costs little if it goes in while the parser is being written rather than retrofitted.

## Why now

This is the last gate. [09](09-gdpr-posture.md) paid the other half on 2026-07-17; slices 02, 04, 05, 07, 08 and 15 are clear to build today, and **03 is the first slice this blocks**. Deciding it unblocks the build end to end.

## Blocked by

None. ([09](09-gdpr-posture.md) is done; the stack and hosting were decided in 04/ADR 0005.)

## Notes

**Grilling format** (Mads, and it is on the map): brief before the ballot — the problem with a concrete example, each option's practical consequences, and the recommendation with its reasoning. One decision at a time; plain language.

Owed on resolution: the **build slice** joining `.scratch/eval-mvp-build/` (the PRD still records this item's slice as owed), and the PRD's gate wording amended per the slice-03 finding above.

## Resolution (grill session 2026-07-17, three ballots, all Mads)

### Ballot 1 — registration is disabled on the public deployment

`emailAndPassword: { disableSignUp: true }` in better-auth (verified against their docs: a one-line, server-side flag), **env-gated** so local development and the test suite keep exercising the full signup path.

The fact that decided it: **the eval's two humans are both seeded.** Slice 02 seeds Mads ("the seed script links Mads's athlete row to a seeded user"), slice 11 seeds the coach, and slice 03's criterion is that Mads can *sign in*. Registration exists to satisfy slice 02's criteria and to serve the real product — **no human in this eval walks through it.** It was a door with nobody to open.

Left open it would have been a public entry point on a health-data app that mints an athlete row per signup (slice 02's ruling) and can reach every Claude-calling route. Chosen over an invite code or email allowlist: more code, and it half-builds something ticket 02 deliberately deferred.

**Cost, accepted:** slice 02's "a person can sign up" criterion is proven locally and in tests, never against the deployed URL. Slice 03's tracer bullet is about proving the *infrastructure* — Next.js, Drizzle, Neon, sessions, EU region — and sign-in exercises all of it. Reversible with an env var the day registration should open.

**Implementation consequence worth stating:** with signup off, **the seed script is the only way an account exists** — so it must create better-auth accounts through better-auth's own server API, not by inserting rows. Get that wrong and nobody can log in at all, on a deployment with no way to self-register out of the problem.

### Ballot 2 — rate limiting: Anthropic-side controls only, no app-level limiter

Set a **workspace spend limit** and **workspace rate limits** in the Anthropic Console. Skip app-level per-user rate limiting for the eval; **revisit at V1**, when registration opens and users are strangers.

Three facts carried it:

- **Ballot 1 shrank the threat model.** Registration is closed, and slice 08 already resolves every conversation from the authenticated server session. Reaching Claude requires being Mads or the coach — abuse now means stolen credentials, not a stranger with a URL.
- **So the realistic failure is a bug, not an attacker** — a retry loop, a `useEffect` without a dependency array. A spend cap bounds that *whatever the cause*, including causes nobody predicted; an app-level limiter is itself code, and can carry the bug it exists to catch.
- **The controls already exist as configuration, on a workspace we must create anyway.** [09](09-gdpr-posture.md) requires a dedicated Anthropic workspace for `allowed_inference_geos`, and the docs note limits cannot be set on the *default* workspace — so the geo lock and the spend cap live in the same place. One Console visit, three controls.

Do-nothing worst case, for the record: the Start tier's **$500/month** spend cap. Survivable, not a control. Set the workspace limit far below it — the realistic bill is a few dollars.

### Ballot 3 — codify the sanitisation the code already does, and bound the raw strings

**The finding: the defence already exists, and is undocumented.** In `poc/garmin.js`, `inferSessionType` returns `SPORT_MAP[sport.toLowerCase()] || 'Endurance'`.

`sessionType` is the **only** file-derived field that reaches a prompt — `formatWeekActivity` and `formatSkippedSessions` interpolate it into lines like `- moved Mon 2026-03-02 {sessionType} to Tue` — and it is already laundered through a whitelist with a safe default. Arbitrary text in a `.fit` file cannot become a `sessionType`; it becomes `Endurance`. Raw file text does live in two columns — `note` (built as "Imported from Garmin · <sport>") and `sport` — and **neither reaches a prompt today**. `summary` is computed from records, so it is numbers.

So the eval is not at risk. **The risk is the port and the future**, two ways:

- An agent porting `garmin.js` "improves" `inferSessionType` by passing `sport` through, because a lookup with a fallback reads as a limitation rather than a defence. Nothing in the code says why it is there.
- Someone adds session notes to a prompt — an entirely natural product wish, since a coach reading session notes is obvious behaviour — and raw file text reaches Claude through a door nobody remembers exists.

**The policy, for the build slice:**

- **File-derived strings are data, never instructions.**
- **Anything from a file that reaches a prompt passes through a lookup with a safe default** — the `inferSessionType` pattern, named as the pattern so the port keeps it deliberately rather than by luck.
- **Raw file strings may be stored and displayed, never interpolated into prompt text.** A regression test asserts it.
- **Bound them at the parse boundary** — cap `sport`'s length, strip control characters — so the database never holds arbitrary file text even in display-only columns. Three lines, and slice 06 is rewriting this parser anyway: now, or a retrofit.

This promotes [slice 06](../../eval-mvp-build/issues/06-garmin-upload-lands-real-data.md)'s interim rule to the permanent policy, and turns its criterion "raw file metadata never reaches a prompt" from a hope into a regression test.

### Raised by this grill, corrected without a ticket (Mads)

**GDPR decision 1 is an intention the POC never implemented.** It claims the athlete's name "is never sent to the Anthropic API" and names `buildWeeklyContext` as an enforcement point. `poc/public/index.html` has a settings field labelled **Name** (placeholder "Your name") whose value flows through that exact function into `renderWeeklyPrompt`, which sends `athlete=<name>` to Anthropic. **The named enforcement point is where the leak is.**

It surfaced here because this ticket owns "defending decision 1 through the server migration" — and defending turned out to mean **establishing**. Corrected in [gdpr-decisions.md decision 1](../../mvp/gdpr-decisions.md); [09](09-gdpr-posture.md), decision 5, the [map](../MAP.md) and [slice 15](../../eval-mvp-build/issues/15-consent-and-lawful-basis.md) all repeated the false claim in a single session and are fixed. No ticket filed (Mads): the correction is mechanical and slice 15 already carries the build criterion — now load-bearing, because it is what makes the consent artifact's "no name reaches Anthropic" true.

Recorded so it does not recur: a working rule in [AGENTS.md](../../../AGENTS.md) — *check a document's claim about the code against the code*. A "Where enforced" line is a hypothesis, not a citation.

### The checklist this hands to the build

- **Anthropic key is a server secret** (ADR 0006) — slice 08.
- **`disableSignUp: true` on the deployment**, env-gated; the seed creates accounts via better-auth's server API — slice 03.
- **Workspace spend limit + rate limits** in the Anthropic Console, on the same workspace [09](09-gdpr-posture.md) needs for `allowed_inference_geos` (HITL).
- **CORS** locked to the deployment's own origin; **security headers** (CSP, HSTS, frame options, referrer policy).
- **FIT/GPX**: lookup-with-safe-default for anything reaching a prompt; bound raw strings at parse; regression test — slice 06.
- **No identity in prompts** — establish it, test it — slice 15.
- **HTTPS** — Vercel. **EU function region** — ticket 04.

### Deferred to V1, deliberately

App-level per-user rate limiting on Claude-calling routes. Right when registration opens and users are strangers; today it would guard two seeded accounts from themselves.
