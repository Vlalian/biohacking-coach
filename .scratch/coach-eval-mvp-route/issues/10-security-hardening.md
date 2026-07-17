Label: wayfinder:grilling
Status: ready-for-human

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
- **No real identity in prompts** — GDPR decision 1, and [09](09-gdpr-posture.md) made it load-bearing for the *lawful basis*, not just prompt hygiene: it is what keeps the DPA's "special categories: None" mismatch small. Defend it through the port; not a ballot.

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

The prompt-injection surface. A `.fit` file carries file-controlled strings — `poc/public/js/garmin-import.js` lifts `sport` and `note` straight out of the parsed file, and the [signed-off schema](05-server-data-model.md) stores `sport`, `title`, and a `summary` JSONB on `sessions`. Those columns reach a prompt in [slice 08](../../eval-mvp-build/issues/08-weekly-session-conversation.md).

For the eval, the files are Mads's own, off his own watch — so the realistic risk is close to zero and the honest question is whether to spend anything on it now. But it is a genuine surface at V1 (an athlete uploads a file they were given), and the cheap version — treat file-derived strings as data, never as instructions; strip or bound them before they enter a prompt — costs little if it goes in while the parser is being written rather than retrofitted.

## Why now

This is the last gate. [09](09-gdpr-posture.md) paid the other half on 2026-07-17; slices 02, 04, 05, 07, 08 and 15 are clear to build today, and **03 is the first slice this blocks**. Deciding it unblocks the build end to end.

## Blocked by

None. ([09](09-gdpr-posture.md) is done; the stack and hosting were decided in 04/ADR 0005.)

## Notes

**Grilling format** (Mads, and it is on the map): brief before the ballot — the problem with a concrete example, each option's practical consequences, and the recommendation with its reasoning. One decision at a time; plain language.

Owed on resolution: the **build slice** joining `.scratch/eval-mvp-build/` (the PRD still records this item's slice as owed), and the PRD's gate wording amended per the slice-03 finding above.
