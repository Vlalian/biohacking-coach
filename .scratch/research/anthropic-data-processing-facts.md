# Anthropic data-processing facts — for the eval-MVP GDPR posture

Researched: 2026-07-16 · Sources: Anthropic/Claude primary legal + docs pages only (linked inline)
For: [Coach-Evaluation MVP Route](../coach-eval-mvp-route/MAP.md) → ticket [01 Anthropic data-processing facts](../coach-eval-mvp-route/issues/01-anthropic-data-processing-facts.md)

**Scope:** the first-party Claude API (`api.anthropic.com`) called from our own server with our own API key, under Anthropic's **Commercial Terms**. Not Bedrock/Vertex (there the cloud provider is the processor), not consumer Claude plans.

---

## The headline: decision 6's premise is false

[gdpr-decisions.md](../mvp/gdpr-decisions.md) decision 6 states: *"Anthropic's API, by default, may use prompt and response data for safety research and model improvement."*

**That is not true of the commercial API, and appears not to have been true at the time it was written.** The [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) (effective 2025-06-17), section B, state:

> "Anthropic may not train models on Customer Content from Services."

The privacy centre says the same in plain terms ([Is my data used for model training?](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)):

> "By default, we will not use your inputs or outputs from our commercial products (e.g. Claude for Work, Anthropic API, Claude Gov, etc.) to train our models."

The only ways training use happens are **opt-in**: submitting thumbs-up/down feedback (that submission is retained 5 years, de-linked from identifiers), or joining the Development Partner Program. We do neither, so this is a non-issue provided we never wire a feedback button into the Anthropic SDK.

**Consequence for the map:** the "must get zero-data-retention before touching real data" blocker was built on a misreading. The real posture question is retention and transfer, not training. Decision 6 needs rewriting, not implementing.

---

## The DPA is free, automatic, and already in force

From [How do I view and sign your DPA?](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa):

> "automatically incorporated into our Commercial Terms of Service" — "When you accept Anthropic's Commercial Terms of Service, you also accept our DPA."

- **No signature, no negotiation, no sales call, no enterprise tier.** Decision 6's "available on request for enterprise customers / may require the enterprise API tier" is wrong on both counts.
- The [DPA](https://www.anthropic.com/legal/data-processing-addendum) (effective 2025-02-24) **includes the EU SCCs** (Modules Two and Three), the **UK Addendum**, and Swiss amendments. That is the Article 46 transfer mechanism for EU→US, already executed.
- Sub-processors are listed at [anthropic.com/subprocessors](https://www.anthropic.com/subprocessors); Anthropic gives "reasonable notice ... prior to giving the Subprocessor access to Customer Personal Data" with a 15-day objection window.
- Security: AES-256 at rest, TLS 1.2+ in transit, MFA, RBAC, annual pen testing.
- On termination: "Within thirty (30) days ... Anthropic will ... delete all copies of Customer Data."

**A solo/pre-company builder needs to do nothing to obtain the DPA** beyond being on Commercial Terms (i.e. a normal paid API account, which the POC already uses). This is the single biggest correction in this sheet.

⚠️ **One snag worth flagging.** DPA Schedule 1, Part B.3 declares:

> "Special categories of personal data (if applicable): None"

The standard DPA is written on the premise that customers do **not** send Article 9 data. If we conclude our training/check-in signals *are* health data, we are sending special-category data under a DPA that says we don't. That is a real (if common) mismatch, and it is a question for the lawyer, not for us to resolve here. It also raises the value of not sending health data in the first place — see the linkage to the Privacy Proxy idea (deferred item E).

---

## Retention: 30 days by default; ZDR needs a sales conversation

Default, without any special arrangement ([commercial retention policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)):

> "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation"

**Zero Data Retention (ZDR)** ([API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)):

- "Under a ZDR arrangement, Anthropic does not store customer prompts or responses at rest after the API response is returned."
- **Obtained only by contacting the [sales team](https://claude.com/contact-sales)**; reviewed and enabled per-organization after an eligibility check. This is the one item genuinely gated behind a human conversation, and the one place a solo builder may hit friction. Eligibility criteria are not published.
- Our usage (plain Messages API, prompt caching) is fully ZDR-eligible.
- **Two gotchas if we ever get ZDR:** CORS is not supported for ZDR organizations (irrelevant — we proxy through Express anyway, and must for the key), and **Claude Fable 5 / Mythos 5 are unavailable under ZDR** (they mandate 30-day retention). Model choice and ZDR are coupled.

**Survives every arrangement, including ZDR:**

> "Anthropic may retain data where required by law or where it has been flagged by Anthropic's automated trust and safety systems. As a result, if a chat or session is flagged, Anthropic may retain inputs and outputs for up to 2 years."

Trust-and-safety classification scores: up to 7 years. So "zero retention" is never literally zero, and any consent artifact should not promise that it is.

---

## Data residency: there is no EU option

This overturns deferred decision C ("EU data residency requires their enterprise tier"). Per [Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency), there are two independent controls, and **neither offers Europe**:

| Control | Governs | Available values |
| --- | --- | --- |
| `inference_geo` (per-request param) | where inference runs | `"global"` (default), `"us"` |
| Workspace geo (set at creation, immutable) | where data is stored at rest | `"us"` only |

Stated explicitly under Current limitations: *"Inference geo: Only `"us"` and `"global"` are available"* and *"Workspace geo: Only `"us"` is currently available."*

- `inference_geo: "us"` costs **1.1x standard token rates** and requires Opus 4.6 / Sonnet 4.6 or later (older models 400 on the parameter).
- So the realistic choice is **US processing** (pinned, +10%) or **global routing** (default, cheapest, inference may run anywhere).
- Either way this is an EU→US (or EU→anywhere) transfer, and the lawful mechanism is the **SCCs already inside the auto-incorporated DPA**. Nothing to negotiate; something to *disclose* in the consent artifact.

---

## Controller vs processor: we are the controller

From [Does Anthropic act as a data processor or controller?](https://privacy.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller): for commercial products the customer organisation is the **Controller** and "Anthropic acts as a 'Processor' of the data on behalf of the customer", processing only on the customer's instructions.

**This answers open question 5 in gdpr-decisions.md.** In the eval:

- **Controller: Mads / the app operator.** Every GDPR duty owed to the coach and to Mads-as-athlete — lawful basis, transparency, data-subject rights, breach notification — lands on the operator, not on Anthropic.
- **Processor: Anthropic**, under the auto-incorporated DPA.
- The hosting/database provider chosen in [04 hosting + DB + auth stack](../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) becomes a **second processor** and needs its own DPA — worth making a selection criterion there.
- Mads is both controller and data subject, which is legally odd but harmless. **The recruited coach is a third-party data subject** whose data the operator controls; that relationship is where the real (if small) obligation sits.

---

## HIPAA/BAA — noted, and not relevant

Anthropic offers self-serve BAA execution in the Console for PHI. **This is US healthcare law and does nothing for GDPR.** Recorded only so nobody later mistakes it for the health-data answer. Note it would also *block* useful features and is permanent once enabled.

---

## What this means for the eval (facts → implications; decisions belong to later tickets)

1. **No blocker to real data from the training angle.** Commercial Terms already forbid training on our content. Decision 6 should be rewritten from "must implement ZDR" to "verify we stay on Commercial Terms and never opt in."
2. **The DPA + SCCs are already in place.** Legally the eval is far better covered than the map assumed. The work is *disclosure*, not *acquisition*.
3. **The live exposure is a 30-day retention window** on prompts, plus the flagged-content tail (2 years) that no arrangement removes. ZDR would shrink the first; it is worth one email to sales, but it is not a launch blocker for two consenting adults.
4. **EU residency is unavailable** — don't design around a control that doesn't exist. Decide `"global"` vs `"us"` (+10%) as an explicit, cheap call.
5. **The consent artifact must not over-promise.** It should name Anthropic as processor, disclose US/global processing under SCCs, and state the 30-day retention and flagged-content tail honestly.
6. **Decision 1 (no real identity in prompts) is now doing more work than ever.** Because the prompts are pseudonymous, the special-category mismatch in the DPA and the retention window both stay small. That constraint is load-bearing and should be defended in the server migration, not quietly dropped.

## Open items this sheet deliberately does not answer

- Whether our check-in signals are Article 9 health data (lawyer question; open question 1 in gdpr-decisions.md).
- Whether to actually request ZDR (a decision — belongs to the GDPR-posture ticket when it graduates).
- ZDR eligibility criteria for a pre-company solo builder (unpublished; only a sales conversation resolves it).
