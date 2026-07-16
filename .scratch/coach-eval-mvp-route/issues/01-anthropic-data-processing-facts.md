Label: wayfinder:research
Status: done
Assignee: agent (wayfinder session 2026-07-16)

# Establish Anthropic's data-processing facts for server-side health-adjacent data

## Question

Once the Anthropic API key moves server-side and real (even if just Mads's) health-adjacent training data flows through prompts, what are the actual data-processing facts we must build the eval's GDPR posture on?

Resolve by research (produce a linked markdown summary):

- Do Anthropic's **current commercial API terms** use prompt/response data for model training by default? (The 2026-07-08 premise in [gdpr-decisions.md](../../mvp/gdpr-decisions.md) decision 6 must be re-verified against today's terms, not assumed.)
- Is a **DPA** and/or **zero-data-retention** arrangement available, on what tier, and through what process? What would it take for a solo/pre-company builder to obtain one?
- What is the **data-residency** reality (US processing by default; EU options, SCCs)?
- Who is the **data controller vs processor** in this setup?

Output: a short facts sheet the GDPR-posture fog-item and the security-hardening work depend on. Acting on the facts (actually requesting/signing a DPA) is downstream — this ticket only establishes what is true and what the process is.

## Blocked by

None — takeable now (independent of the architecture/stack decisions).

## Resolution

Resolved 2026-07-16 by research against Anthropic's primary legal and docs pages. Full facts sheet: **[anthropic-data-processing-facts.md](../../research/anthropic-data-processing-facts.md)**.

The four questions, answered:

1. **Training on prompt/response by default?** **No — and the premise was false.** [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) §B (eff. 2025-06-17): "Anthropic may not train models on Customer Content from Services." Training use is opt-in only (thumbs-up/down feedback submissions; Development Partner Program). **[gdpr-decisions.md](../../mvp/gdpr-decisions.md) decision 6 is built on a misreading and needs rewriting, not implementing.**

2. **DPA / ZDR availability and process?** The **DPA is automatic, free, and already in force** — no signature, no sales call, no enterprise tier: it is "automatically incorporated into our Commercial Terms of Service", and it **contains the EU SCCs**, the UK Addendum and Swiss amendments. Decision 6's "available on request for enterprise customers / may require the enterprise API tier" is wrong on both counts. **ZDR is the one genuinely gated item**: per-organization, granted only via [contacting sales](https://claude.com/contact-sales) after an unpublished eligibility review. Without it, default retention is **30 days**. With it, prompts aren't stored at rest — but flagged content is still retained up to 2 years (T&S scores 7 years) under *every* arrangement, so "zero retention" is never literally zero.
   ⚠️ **Snag:** DPA Schedule 1 Part B.3 declares "Special categories of personal data (if applicable): **None**". If our signals are Article 9 health data, we'd be sending them under a DPA that says we don't. Lawyer question; also makes decision 1 (no real identity in prompts) load-bearing.

3. **Data residency?** **There is no EU option** — this overturns deferred decision C's "EU data residency requires their enterprise tier". `inference_geo` offers only `"global"` (default) or `"us"` (+10% token cost, Opus/Sonnet 4.6+); workspace storage geo is **`"us"` only** and immutable. Either way it's an EU→US transfer, lawfully covered by the SCCs already inside the auto-incorporated DPA. Nothing to negotiate — something to *disclose*.

4. **Controller vs processor?** **We are the Controller; Anthropic is the Processor** ("Anthropic acts as a 'Processor' of the data on behalf of the customer"). **This answers open question 5.** Every GDPR duty lands on the app operator (Mads). The hosting/DB provider from [04](04-hosting-db-auth-stack.md) becomes a **second processor needing its own DPA** — a selection criterion for that ticket. Mads is both controller and data subject (odd, harmless); **the recruited coach is a third-party data subject** — that's where the real obligation sits.

**Net effect on the route:** the eval is far less legally blocked than the map assumed. The GDPR work is *disclosure and honesty in the consent artifact*, not *acquiring agreements*. The live exposure is the 30-day retention window plus the flagged-content tail, not training.

Two facts also land on the security-hardening fog item: CORS is unsupported for ZDR orgs (we proxy through Express anyway — reinforces the server-side key), and Fable 5 / Mythos 5 can't be used under ZDR (model choice and ZDR are coupled).

Not answered here (correctly out of this ticket's remit): whether check-in signals are Article 9 data (lawyer), whether to actually request ZDR (a decision for the GDPR-posture ticket), and ZDR eligibility for a pre-company solo builder (only sales can say).
