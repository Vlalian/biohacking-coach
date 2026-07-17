Label: wayfinder:grilling
Status: done
Assignee: Claude + Mads (grill session 2026-07-17)

# GDPR posture for the eval

Map: ../MAP.md

## Question

Graduated from the map's **Not yet specified** section on 2026-07-17. The item had
been waiting on the server data model ([05](05-server-data-model.md)) to sharpen it;
05 landed, and [06](06-display-name-vs-identity-separation.md) settled what a leak
would expose. It is now answerable.

Decide the lawful basis for two consenting adults, the minimum viable consent
artifact, and the [gdpr-decisions.md](../../mvp/gdpr-decisions.md) rewrites that
server-side and multi-party health-adjacent data force.

**This is a risk-posture and disclosure question, not a legal determination.** No
lawyer was involved. `gdpr-decisions.md` describes itself as a handoff document *for*
a legal review, and it still is. Where a real lawyer question remains, it is recorded
as one rather than ruled on.

## Blocked by

None. (Was waiting on 05, resolved 2026-07-16.)

## Resolution (grill session 2026-07-17, four ballots, all Mads)

### The reframe that shaped every ballot: the data splits in two

The map's fog treated the eval's data as one thing. It is two, and they live in
different places:

- **Raw physiology** — the per-sample Garmin streams from [slice 06](../../eval-mvp-build/issues/06-garmin-upload-lands-real-data.md):
  heart rate every 10s, speed, altitude, power, cadence. This is the most
  special-category-looking data in the system. It lives in **Neon Frankfurt**, and it
  **never reaches Anthropic** — the prompts carry aggregates, not sample arrays. It
  never leaves the EU.
- **What crosses the Atlantic** — a prompt, assembled fresh per Coach interaction:
  Training Phase, experience level, session counts, RPE scores, Check-in values
  *including resting pulse*, plus athlete free text (Coach Chat, reflection comments).
  No name, no email — GDPR decision 1 has enforced that since the POC.

So the scariest data stays home, and the US transfer carries the pseudonymous subset
under SCCs that are already executed. That is a materially better starting position
than "GDPR posture" as a single fog item implied, and it is why the ballots below are
small rather than existential.

### Ballots

**1. The eval treats its data as Article 9 special-category health data, and builds
on explicit consent.**

Genuinely arguable — a 1–10 self-report is a long way from a medical record, but
resting pulse is a physiological measurement and months of per-sample HR can reveal
actual conditions. Open question 1 has waited for a lawyer since the POC.

Ruled without waiting, on the argument that the question doesn't need answering:
**explicit consent is a valid lawful basis for ordinary personal data too.** The
conservative posture is therefore correct under *both* readings; the permissive one is
correct only if the arguable question breaks our way. At two-person scale the delta is
a clear disclosure and an unbundled checkbox — buying that saving with the risk that
the coach's lawful basis is void is a bad trade. Moots the lawyer question *for the
eval* rather than blocking on it; the question stays open and honest for real users.

**2. `inference_geo: "us"`, enforced at the workspace with `allowed_inference_geos: ["us"]`.**

Verified against the live docs 2026-07-17 (they confirmed the research sheet):
`inference_geo` accepts only `"global"` (default) or `"us"`; workspace geo — storage
at rest — is **`"us"` only and immutable after workspace creation**. *There is no EU
option.* Don't design around a control that doesn't exist.

`"us"` costs **1.1x on every token category** (input, output, cache writes, cache
reads). At one athlete and one coach on Sonnet, that surcharge is pennies a month —
the cost side is a red herring. What it buys is a consent artifact that names **one
country**: processed in the United States under SCCs. `"global"` can only say "the US
or elsewhere", and cannot say where, because Anthropic doesn't publish it. Since
storage at rest is US-only regardless, `"global"` does not avoid a US transfer — it
adds countries on top of one we're making anyway.

**Workspace-enforced, not per-request** — the docs surfaced `allowed_inference_geos` /
`default_inference_geo`, which the research sheet missed. A request that omits the
parameter or asks for `global` is rejected by the API rather than quietly routed. Same
reasoning as [06](06-display-name-vs-identity-separation.md): a consent artifact
promising US-only processing must not depend on every future `messages.create` call
remembering a parameter. Structural over conventional.

*Ballot history worth keeping:* Mads first chose `global` "because a high-end frontier
model is unnecessary". The two are unrelated — `inference_geo` selects geography, not
model tier; both values run the identical model. The reason didn't survive contact
with what the parameter does, and the ballot was re-put and reversed. **The
model-tier instinct is separate, legitimate, and still open** — see Not decided here.

**3. Zero Data Retention: skipped. Nothing is gated on it.**

The research sheet called a 30-day retention window "the live exposure". **That
overstates it**, and the sheet is corrected. Both Anthropic sources, read together:
*"conversation content is not retained by default for API users"* and *"we
automatically delete inputs and outputs on our backend within 30 days"*. The 30 days
is a **deletion ceiling** for whatever does land on the backend, not a promise that
prompts sit there for a month.

So ZDR would upgrade "not retained by default" to "contractually guaranteed not
retained" — real, but a narrower gap than the sheet implied. It costs a sales
conversation with unpublished eligibility criteria, conducted as a pre-company solo
builder. And it removes nothing that actually persists: the flagged-content tail
survives every arrangement.

Both documented ZDR side effects are moot for us: CORS is unsupported under ZDR (we
proxy server-side anyway, and must, because of the API key), and Fable 5 / Mythos 5
are unavailable under ZDR (we are on Sonnet 4.6 and want no frontier model). Revisit
if the product goes multi-real-athlete.

**4. The consent artifact is in-app and recorded server-side, with the text versioned.**

Disclosure screen plus an unbundled checkbox: the athlete at onboarding
([slice 09](../../eval-mvp-build/issues/09-onboarding-writes-the-profile.md)), the
coach at first sign-in ([slice 11](../../eval-mvp-build/issues/11-coach-logs-in-and-sees-the-roster.md)).
A row records who, when, and **which version of the text** they agreed to.

Chosen over a signed PDF because **Article 7 requires the controller to *demonstrate*
consent** — not merely obtain it, but prove it later on request. A timestamped row
naming a text version does that; an email thread does it worse. It is also what a real
roster needs on day one (standing scope principle), the surfaces already exist in two
slices, and withdrawal-as-easy-as-giving needs a UI eventually regardless.

### Who is actually consenting

- **Mads** is both controller and data subject for the Article 9 material. Legally odd,
  harmless, and the artifact still must exist — it is what a real athlete meets later.
- **The recruited coach is a third-party data subject**, and that is where the genuine
  obligation sits. Their *own* data (name, email, Briefing conversations) is ordinary
  personal data, not Article 9. They are also the *recipient* of Mads's health data,
  which is precisely what ballot 1's explicit consent must cover.

### What the disclosure must say

Written to be true under **both** readings of the retention sources, so no future
correction can make it a lie:

- **Anthropic is a processor; we are the Controller.** (Answers open question 5.)
- **Processing runs in the United States** under the Standard Contractual Clauses
  inside the auto-incorporated DPA. Already executed — nothing to sign. (Answers open
  question 3.)
- **Anthropic does not retain conversation content by default; anything reaching their
  systems is deleted within 30 days; content flagged by automated safety systems may be
  kept up to 2 years**, and trust-and-safety scores up to 7. No arrangement removes
  that tail.
- **Never promise "zero retention."** The flagged tail makes it a lie no arrangement
  could make true.
- **Server custody is *better* custody than localStorage** (ADR 0006) — say so. The
  browser-clear wipe was always an undisclosed data-loss risk.
- **What a leak of the training data would expose**: opaque IDs, fabricated synthetic
  labels, no real name — true as written since [06](06-display-name-vs-identity-separation.md).
- **The raw Garmin streams never leave the EU** and never reach Anthropic.
- **Deletion path** = an operator script for the eval, per ADR 0006. Not a decision;
  recorded so the artifact can describe it honestly.

### Still a lawyer question — recorded, not ruled

- **The DPA declares "Special categories of personal data: None."** Ballot 1 rules our
  data *is* Article 9, so we are sending special-category data under a DPA that says we
  don't. Pseudonymity shrinks the mismatch — Anthropic cannot re-identify what it
  receives, and the raw streams never arrive — but it does not erase it. Real question,
  common situation, not ours to resolve.
- **The consent *wording*.** The facts above are verified. "Informed, freely given,
  unbundled" is a drafting standard, and this file has always been the handoff document
  for that review. A lawyer should read the text before a third party relies on it.
- **Open question 1** (are the signals Article 9?) stays open for real users. Ballot 1
  moots it for the eval by picking the posture that is correct either way.
- **Deferred item D (re-identification via public Ironman results)** is untouched by
  this ruling and stays deferred.

### Not decided here

- **`COACH_MODEL` tier.** `poc/server.js` defaults to `claude-sonnet-4-6` — already not
  a frontier model. Haiku 4.5 is $1/$5 per MTok against Sonnet's $3/$15, a real 3x
  saving on the actual bill where `inference_geo` is a 10% surcharge on a few dollars.
  A cost-and-coaching-quality decision, not a GDPR one. Mads's instinct pointed here
  during ballot 2; it deserves its own briefing.
- **Security hardening consolidation** — still open on the map, and still a joint gate
  on [slice 06](../../eval-mvp-build/issues/06-garmin-upload-lands-real-data.md) with
  this item. This ruling does not unblock real data on its own.
