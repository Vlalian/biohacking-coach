Status: ready-for-agent
Label: wayfinder:task

# 15 — Consent, recorded and demonstrable

## Parent

`.scratch/eval-mvp-build/PRD.md`

## Sequencing — read this first

**Despite its number, this slice lands before [slice 06](06-garmin-upload-lands-real-data.md).** The number is a filing ID, not its position: slices 01–14 were sequenced on 2026-07-16 with the GDPR slices deliberately deferred, and the PRD says they "join this directory once those decisions lock". They locked on 2026-07-17 ([route ticket 09](../../coach-eval-mvp-route/issues/09-gdpr-posture.md)), so this arrives last-numbered and early-ordered.

Slice 06 is where Mads's **real Garmin data first lands on hosted infrastructure**, and the PRD gates that on the GDPR posture being decided **and its controls in place**. This slice is those controls. Real data does not land before it runs.

**This slice is not the whole gate.** The route's **security hardening consolidation** is still open and gates slice 06 jointly with this one. Landing this does not unblock real data on its own.

## What to build

**1. `inference_geo: "us"` on every Anthropic call, and locked at the workspace.**

Two halves, and the second is the load-bearing one:

- Pass `inference_geo: "us"` as a **top-level request parameter** on `/v1/messages` (not in a header, not nested). It is supported on Sonnet 4.6 — which is what `COACH_MODEL` defaults to — and returns 400 on Opus 4.5 / Sonnet 4.5 / Haiku 4.5 or earlier. Costs 1.1x on every token category.
- **Set `allowed_inference_geos: ["us"]` and `default_inference_geo: "us"` on the Anthropic workspace** (Console, or the Admin API under `data_residency`). This is what makes the consent artifact's promise structural: a request that omits the parameter, or asks for `global`, is **rejected by the API** rather than quietly routed elsewhere. Per route 09, the promise must not depend on every future `messages.create` remembering a parameter.

`response.usage.inference_geo` reports where inference actually ran — assert on it in a test rather than trusting the request.

**2. The consent artifact, in-app and versioned.**

A disclosure screen with an **unbundled** checkbox — consent to the health-data processing must be its own affirmative act, not bundled into terms acceptance or a signup button.

Two entry points, both on surfaces other slices already build:

- **Athlete** — at onboarding ([slice 09](09-onboarding-writes-the-profile.md)).
- **Coach** — at first sign-in ([slice 11](11-coach-logs-in-and-sees-the-roster.md)). The coach is a **third-party data subject**, and route 09 records that as where the genuine obligation sits.

Ordering note: this slice must gate **real data** (slice 06), which precedes both 09 and 11. So build the consent gate here and wire it to whichever surface exists at the time; 09 and 11 adopt it when they land rather than inventing their own.

**3. Consent is recorded server-side, with the text versioned.**

**Article 7 requires the controller to *demonstrate* consent** — not merely obtain it, but prove it later, on request. So a row, not a remembered conversation: who consented, **when**, and **which version of the disclosure text** they saw. Version the text as content in the repo, not a string in a component: "they agreed to v1" has to be answerable a year later.

Withdrawal must be **as easy as giving**. For the eval it may be a route and an operator script rather than a settings surface, but it exists and the artifact describes it truthfully.

**4. The disclosure's content is decided — do not re-litigate it, and do not soften it.**

Every fact below was verified against Anthropic's primary sources on 2026-07-17 and is written to be true under **both** readings of the retention documentation, so no later correction can make it a lie:

- **We are the Controller. Anthropic is a Processor**, under a DPA already in force.
- **Processing runs in the United States**, under the **Standard Contractual Clauses** inside that DPA — already executed, nothing signed.
- **Anthropic does not retain conversation content by default**; anything reaching their systems is deleted within **30 days**; content flagged by automated safety systems may be kept **up to 2 years** (classification scores up to 7).
- **Never promise "zero retention."** The flagged tail makes it a lie no arrangement could make true. This is not stylistic — it is the one sentence route 09 names explicitly.
- **The raw Garmin streams never leave the EU** and never reach Anthropic. They live in Neon Frankfurt; the prompts carry aggregates, not sample arrays.
- **What a leak of the training tables would expose**: opaque IDs, fabricated synthetic labels, **no real name** — true as written since [route 06](../../coach-eval-mvp-route/issues/06-display-name-vs-identity-separation.md).
- **Server custody is *better* custody than localStorage** (ADR 0006) — say so plainly rather than apologising. The browser-clear wipe was always an undisclosed data-loss risk.
- **Deletion** is an operator script for the eval (ADR 0006). Describe it honestly; don't imply a self-serve flow that doesn't exist.

**5. Do not let real identity into a prompt.**

GDPR decision 1 has held since the POC and is now **load-bearing for the whole posture**, not tidiness: it is what keeps the DPA's "special categories: None" mismatch small. The port must defend it, not quietly drop it.

## Acceptance criteria

- [ ] Every Anthropic call passes `inference_geo: "us"`; a test asserts `response.usage.inference_geo === "us"` rather than trusting the request
- [ ] The Anthropic workspace has `allowed_inference_geos: ["us"]` and `default_inference_geo: "us"`; a call omitting the parameter is rejected by the API, not routed to `global` (HITL — Console)
- [ ] A disclosure screen renders before any Article 9 processing, with an **unbundled** consent checkbox — not bundled into signup or terms
- [ ] Consenting writes a row recording who, when, and the **version** of the text shown
- [ ] The disclosure text lives in the repo as versioned content, not inline in a component
- [ ] The text never uses the phrase "zero retention" or equivalent, and states the 30-day ceiling and the 2-year flagged tail
- [ ] Without a consent record, the athlete cannot reach a flow that sends their data to Anthropic — the gate is enforced server-side, not by hiding a button
- [ ] A withdrawal path exists and the disclosure describes it truthfully
- [ ] No prompt carries a name or email — a test covers the prompt-rendering seam
- [ ] Tests cover the gate (no consent → no processing), the version recording, and the `inference_geo` assertion

## Blocked by

`.scratch/eval-mvp-build/issues/02-login-with-better-auth.md` — needs a person to attach a consent record to.

## Notes

**HITL:** the workspace geo settings need Console access, and **workspace geo (storage at rest) is `"us"` only and cannot be changed after the workspace is created**. Worth knowing before creating the Anthropic workspace, not after.

**Still a lawyer question, per route 09:** the *wording*. The facts are verified; "informed, freely given, unbundled" is a drafting standard, and `gdpr-decisions.md` has always been the handoff document for that review. Build the mechanism; expect the text to be redrafted before a third party relies on it — which is exactly why it is versioned.

**Not this slice's business:** the `COACH_MODEL` tier decision (open, and a cost question, not a GDPR one), and the security hardening consolidation (open on the route map, gates slice 06 jointly with this).
