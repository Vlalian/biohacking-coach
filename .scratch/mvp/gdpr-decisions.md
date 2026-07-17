Status: living document — update as decisions are made or reversed
Last updated: 2026-07-17 (GDPR posture ruled — [route ticket 09](../coach-eval-mvp-route/issues/09-gdpr-posture.md): decisions 5, 6 and C rewritten as factually wrong; decision 7 added; open questions 3, 4, 5 closed; question 6 raised)

# GDPR Design Decisions

This file records every design choice made (or explicitly deferred) in relation to GDPR compliance. It is intended as a handoff document for a legal/privacy review before the MVP goes live with real users.

The app collects and processes data about athletes' physical state, training behaviour, and potentially health signals. This places it in proximity to **Article 9 special category data** (health data), which carries the highest GDPR protection requirements. Every decision below should be read with that in mind.

---

## Decisions implemented (POC / MVP)

### 1. No real identity in AI prompts
The athlete's name, email, date of birth, location, or any other direct identifier is **never sent to the Anthropic API**. The system prompt refers to "the athlete" throughout in second person. The API receives only pseudonymous training signals: phase, experience level, session counts, feedback scores, and check-in values (body/mental/energy/sleep/pulse).

**Where enforced:** `poc/server.js` — all `buildCoachContext`, `buildWeeklyContext`, and `buildChatPrompt` functions. Also instructed in the Coach Chat system prompt: "Never use or reference the athlete's real name."

**Risk note:** Training metrics alone are not directly identifying, but they could theoretically be re-identified if cross-referenced with public Ironman race results (which are publicly searchable by name, race time, and date). This linkability risk is documented but not yet mitigated. See deferred item below.

---

### 2. Session feedback stored locally only
Session Feedback (RPE ratings + optional comments) is stored exclusively in **browser localStorage** under the key `bh_session_feedback`. It is not sent to any server. The Coach receives an aggregated summary of the week's RPE scores during the Weekly Session — it does not receive the raw stored objects.

**Where enforced:** `poc/public/js/feedback.js` — `setSessionFeedback`, `getSessionFeedback`, `getLastWeekFeedback`.

**Risk note:** localStorage is cleared if the user clears browser data. There is no server-side backup. In the MVP this becomes a real UX issue (data loss on new device or browser wipe), and the move to server-side storage triggers full GDPR obligations for that stored data.

---

### 3. Coach Chat privacy notice
When the athlete opens a Coach Chat, a notice is displayed before they type:

> "Conversations are processed by Claude AI. Avoid sharing sensitive personal or medical information."

This is a lightweight consent signal and an explicit warning that free text is processed by an external AI model. It does not constitute full GDPR-compliant informed consent but documents intent and begins building the disclosure trail.

**Where enforced:** `poc/public/index.html` — `#chatPrivacyNotice` element, shown by `startCoachChat()` in `conversation.js`.

---

### 4. Free-text comment field limited in scope (MVP)
The optional comment field in Session Feedback (post-workout emoji rating) exists in the POC but its GDPR implications have been explicitly noted and deferred. Free text may contain health data ("my knee hurt"), personally identifiable context ("I was at the Leeds race"), or sensitive personal information. In the MVP:

- Comments are stored in localStorage only (see decision 2)
- They are included in the weekly feedback summary sent to the Anthropic API during the Weekly Session
- A full GDPR assessment of this is **pending** before the comment field can be live with real users

**Status:** POC prototype only. Not for real user data until reviewed.

---

### 5. Data minimisation by design
Only data necessary for the coaching function is collected and sent to the API:
- Check-in signals: body readiness, mental state, energy, sleep, resting pulse
- Training metadata: phase, experience level, session count
- Session feedback: RPE ratings (1–10 Body, 1–10 Mind), optional comment

~~No demographic data, no location, no wearable biometric streams, no health records. The coaching intelligence is derived from self-reported subjective signals, not from medical or fitness tracking integrations (those are V2).~~

**REWRITTEN 2026-07-17** ([route ticket 09](../coach-eval-mvp-route/issues/09-gdpr-posture.md)). The struck sentence is now false: **wearable biometric streams are in scope.** The [garmin-sync route](../garmin-sync/PRD.md) landed real per-sample streams, and [eval-MVP slice 06](../eval-mvp-build/issues/06-garmin-upload-lands-real-data.md) puts them on a server. Minimisation survives, but the honest statement is now about *where each kind of data goes*, not about what we refuse to collect:

- **Held in Neon Frankfurt (EU), never sent to Anthropic:** per-sample Garmin streams — heart rate every 10s, speed, altitude, power, cadence. The calc module reads them server-side. This is the most sensitive data in the system and it never leaves the EU.
- **Sent to Anthropic:** a prompt assembled per interaction — Training Phase, experience level, session counts, RPE ratings (1–10 Body, 1–10 Mind), Check-in values (body readiness, mental state, energy, sleep, resting pulse), plus athlete free text. **No name, no email** (decision 1).
- **Still not collected:** demographic data beyond the Athlete Profile's training fields, location, medical records.

Data minimisation now means *the prompt carries aggregates, not sample arrays* — a design property to defend in the port, not an absence to claim.

---

### 6. ~~Zero data retention — flagged, not yet implemented~~ Retention and transfer — decided; nothing to acquire
~~Anthropic's API, by default, may use prompt and response data for safety research and model improvement. This is incompatible with handling health-adjacent data without explicit user consent and a data processing agreement.~~

~~**What's needed:**~~
- ~~A **Data Processing Agreement (DPA)** with Anthropic — available on request for enterprise customers~~
- ~~A **zero data retention** agreement or the equivalent opt-out mechanism~~
- ~~This may require the enterprise API tier~~

~~**This must be resolved before real user data is handled.** Do not launch MVP without it.~~

**REWRITTEN 2026-07-17** ([route ticket 09](../coach-eval-mvp-route/issues/09-gdpr-posture.md), on [ticket 01's research](../research/anthropic-data-processing-facts.md)). **Every claim above was wrong**, and the blocker it declared never existed:

- **Training on our content is already forbidden.** Commercial Terms §B: "Anthropic may not train models on Customer Content from Services." Training use is opt-in only (thumbs-up/down feedback, or the Development Partner Program). We do neither — **so never wire a feedback button into the Anthropic SDK**, which is the only way this becomes untrue.
- **The DPA is free, automatic, and already in force.** Auto-incorporated into the Commercial Terms: no signature, no sales call, no enterprise tier. It contains the **EU SCCs** (Modules Two and Three) — the Article 46 transfer mechanism for EU→US, already executed.
- **Retention is smaller than this file claimed, and smaller than the research sheet claimed** (the sheet is corrected too). Anthropic does not retain conversation content by default for API users; anything reaching their backend is deleted within 30 days. **The 30 days is a deletion ceiling, not a retention promise.**
- **ZDR is skipped** (ballot 3, 2026-07-17). It would upgrade "not retained by default" to "contractually guaranteed not retained", at the cost of a sales conversation with unpublished eligibility criteria — and it removes nothing that actually persists.
- **What persists regardless of any arrangement:** content flagged by automated trust-and-safety systems, up to **2 years**; classification scores up to **7 years**. **Never promise "zero retention"** — the flagged tail makes it a lie no arrangement could make true.

**The work was always disclosure, not acquisition.** Nothing to buy, nothing to sign. Decision 7 is what replaces this.

**POC status:** the `buildChatPrompt` TODO in `poc/server.js` flags a blocker that isn't real; it dies with the POC. The Coach Chat privacy notice (decision 3) stands until decision 7's consent artifact supersedes it.

---

### 7. Lawful basis: explicit consent, on an Article 9 posture
**ADDED 2026-07-17** ([route ticket 09](../coach-eval-mvp-route/issues/09-gdpr-posture.md), ballots 1 and 4 — all Mads). Promotes deferred item A into a decision.

**The eval treats its data as Article 9 special-category health data and builds on explicit consent.** Genuinely arguable — a 1–10 self-report is far from a medical record, but resting pulse is a physiological measurement, and months of per-sample HR can reveal actual conditions. Ruled without waiting for the lawyer, because **the question doesn't need answering**: explicit consent is a valid lawful basis for *ordinary* personal data too, so the conservative posture is correct under **both** readings, while the permissive one is correct only if the arguable question breaks our way. At two-person scale the delta is a disclosure and an unbundled checkbox. Open question 1 stays open for real users; this moots it for the eval.

**The artifact is in-app and recorded server-side, with the text versioned.** Disclosure plus an unbundled checkbox — the athlete at onboarding, the coach at first sign-in — writing a row that records who, when, and **which version of the text** they agreed to. Chosen over a signed PDF because **Article 7 requires the controller to *demonstrate* consent**, not merely obtain it: a timestamped row naming a text version does that; an email thread does it worse. It is also what a real roster needs on day one, and withdrawal-as-easy-as-giving needs a UI regardless. Built by [eval-MVP slice 15](../eval-mvp-build/issues/15-consent-and-lawful-basis.md).

**Who consents.** Mads is both controller and data subject for the Article 9 material — legally odd, harmless, and the artifact must still exist because it is what a real athlete meets later. **The recruited coach is a third-party data subject, and that is where the genuine obligation sits**: their own data (name, email, Briefing conversations) is ordinary personal data, while they are simultaneously the *recipient* of Mads's health data — which is exactly what the explicit consent covers.

**What the disclosure says** — written to be true under both readings of the retention sources, so no later correction can make it a lie: Anthropic is a **processor** and we are the **Controller**; processing runs in the **United States under the SCCs** already in force; Anthropic **does not retain conversation content by default**, anything reaching their systems is deleted within **30 days**, and **flagged content may be kept up to 2 years** (scores up to 7); the **raw Garmin streams never leave the EU**; a leak of the training tables would expose **opaque IDs, fabricated labels, and no real name** ([route 06](../coach-eval-mvp-route/issues/06-display-name-vs-identity-separation.md)); server custody is **better** custody than localStorage; deletion is an operator script for the eval.

**Never promise "zero retention."** The flagged tail makes it a lie no arrangement could make true.

**Still a lawyer question:** the *wording*. The facts above are verified; "informed, freely given, unbundled" is a drafting standard, and this file has always been the handoff document for that review. A lawyer should read the text before a third party relies on it.

---

## Deferred decisions (MVP or later)

### A. ~~Lawful basis for processing~~ — PROMOTED to decision 7 (2026-07-17)
~~GDPR requires a lawful basis for processing personal data. For health-adjacent data (Article 9), the most appropriate basis is **explicit consent**. The current POC has no consent mechanism.~~

~~**MVP requirement:** An onboarding consent flow that:~~
- ~~Explains what data is collected and why~~
- ~~Names Anthropic as a data processor~~
- ~~Explicitly covers processing of health-related signals~~
- ~~Allows withdrawal of consent (right to erasure flow)~~

Decided 2026-07-17 — see **decision 7** above. This item guessed right: explicit consent, and the four requirements it listed all survive into the artifact.

---

### B. Data subject rights
GDPR grants users the right to access, correct, and erase their data. The current POC has no mechanism for any of these.

**MVP requirement:** At minimum, a "Delete all my data" option that clears localStorage and any server-side records. If coach conversation history is stored server-side (as planned for the MVP data layer), a full data export + erasure flow is required.

---

### C. ~~Server-side data storage GDPR implications~~ Server-side storage — decided, no longer deferred
~~The MVP architecture plans for SQLite + SQLCipher on-device storage for the Athlete Profile. If this moves to server-side storage (required for multi-device access, push notifications, or analytics), the full GDPR obligation for stored personal data applies:~~
- ~~Data residency: Anthropic processes in the US by default; EU data residency requires their enterprise tier or a different model provider~~
- ~~Standard Contractual Clauses (SCCs) may be required for EU → US data transfers~~
- ~~Privacy policy and DPA must cover the server-side storage provider~~

**REWRITTEN 2026-07-17** ([route ticket 09](../coach-eval-mvp-route/issues/09-gdpr-posture.md)). This is no longer an "if" — [ADR 0006](../../docs/adr/0006-server-authoritative-architecture.md) made the server authoritative, and SQLite + SQLCipher on-device is dead. Two of the three bullets were also factually wrong:

- **"EU data residency requires their enterprise tier"** — false. **EU residency does not exist at any tier.** Verified against Anthropic's live docs 2026-07-17: `inference_geo` accepts only `"global"` or `"us"`, and workspace geo (storage at rest) is **`"us"` only and immutable after workspace creation**. There is no European option to buy. Ruled: **`inference_geo: "us"`**, enforced at the workspace via `allowed_inference_geos: ["us"]` so a forgotten parameter is rejected rather than routed. Costs 1.1x per token; pennies at eval scale.
- **"SCCs may be required"** — they are required, and they are **already in force**: the auto-incorporated DPA contains them (see rewritten decision 6). Nothing to negotiate.
- **"Privacy policy and DPA must cover the server-side storage provider"** — correct, and done. Both concluded before real athlete data lands: **Neon Frankfurt** (EU region verified; DPA auto-incorporated via the Databricks MCSA) and **Vercel Pro** (EU function region; DPA on Pro only — Hobby was disqualified for lacking it). See [route ticket 04](../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) and its [research](../research/postgres-host-eu-residency-dpa.md).

**Where the data actually sits**, which is what the consent artifact must describe: everything at rest is in **Neon Frankfurt**, including the Garmin streams and the better-auth identity tables. Only a pseudonymous prompt crosses to the US. **Server custody is *better* custody than localStorage** (ADR 0006) — say so plainly rather than apologising for it: the browser-clear wipe was always an undisclosed data-loss risk.

**Deletion path:** an operator script for the eval, per ADR 0006. A real server feature before any third party beyond the recruited coach joins.

---

### D. Re-identification / linkability
Ironman race results are publicly searchable (by name, finish time, race date, age group). A sufficiently granular training data profile (phase, load progression, race target date) could potentially be re-identified when cross-referenced with public race records. This is a low-probability risk for the POC but becomes more serious at scale.

**Deferred:** No mitigation implemented yet. Worth raising with a privacy lawyer before the app reaches a meaningful user base.

---

### E. On-device Privacy Proxy (V2)
The architecture design includes a **Privacy Proxy** — an on-device layer that intercepts free-text inputs, removes or generalises PII, and constructs a structured query before any data leaves the device. This is the designed long-term solution for handling free text safely.

**Status:** Architecture decision made, not implemented. Requires either a local ML model or a deterministic rule set for PII stripping. Flag for V2 when free text becomes a core feature.

---

### F. Wearable / fitness API integration (V2)
When the app integrates with a wearable API (Garmin, Apple Health, Strava, etc.) to detect workout completion and trigger the Session Feedback Prompt, new GDPR obligations arise:
- These APIs provide biometric data which is special category under GDPR
- The OAuth consent for those integrations must explicitly cover AI coaching use
- The data minimisation principle applies: only pull what's needed for the coaching function

**Status:** V2. Not designed yet. Flag for legal review at integration stage.

---

## Open questions for legal review

**Triaged 2026-07-17** ([route ticket 09](../coach-eval-mvp-route/issues/09-gdpr-posture.md)). Three of the five are answered by research, not opinion, and are closed. The rest are genuinely for a lawyer.

1. **Still open — and deliberately mooted for the eval.** Does subjective self-reported training data (body readiness, mental state, energy on a 1–10 scale) constitute health data under Article 9, or ordinary personal data? Decision 7 does not answer this; it picks the posture that is correct **either way** (explicit consent is valid for both), so the eval need not wait. The question returns with real users — and note the ground has shifted since it was written: **resting pulse and per-sample Garmin heart rate are now in scope**, which is a stronger case for Article 9 than 1–10 self-reports ever were.
2. **Still open.** Is a privacy notice sufficient for Coach Chat free-text, or is explicit granular consent required per conversation? Decision 7 takes the conservative route — one explicit consent covering free-text processing, disclosed up front — but *per-conversation granularity* is untested and is a drafting question. Related: the **wording** of the consent artifact needs a lawyer before a third party relies on it.
3. ~~What SCCs or transfer mechanisms are needed for EU athlete data processed via Anthropic's US-based API?~~ **CLOSED — answered by research, nothing to acquire.** The **EU SCCs (Modules Two and Three) are already in force**, auto-incorporated into the Commercial Terms via the DPA. No signature, no negotiation, no enterprise tier. See rewritten decision 6.
4. ~~Is the "legitimate interests" lawful basis viable for any part of this processing, or is explicit consent required throughout?~~ **CLOSED by ballot 1 as a decision, not a legal finding.** Legitimate interests *might* be viable if the data is ordinary — but we chose not to find out, because explicit consent is correct under both readings and costs a checkbox at two-person scale. Revisit only if consent friction becomes a real product problem at scale.
5. ~~Who is the data controller — the app operator, Anthropic, or both?~~ **CLOSED — answered by Anthropic's own documentation.** For commercial products the customer organisation is the **Controller** and Anthropic is the **Processor**, acting only on the customer's instructions. So: **Controller = Mads / the app operator.** Every duty — lawful basis, transparency, data-subject rights, breach notification — lands on the operator. **Neon and Vercel are second and third processors**, each with its own DPA already concluded ([route ticket 04](../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md)).

### New question, raised by this ruling

6. **Does the DPA's "Special categories of personal data: None" declaration bite?** Anthropic's standard DPA (Schedule 1, Part B.3) is written on the premise that customers send no Article 9 data. Decision 7 rules our data **is** Article 9 — so we are sending special-category data under a DPA that declares we don't. Pseudonymity shrinks the mismatch (no name or email reaches Anthropic; the raw streams never arrive at all) but does not erase it. A real question, a common situation, and not ours to resolve. It also raises the value of **never letting real identity into a prompt** — decision 1 is now load-bearing for the whole posture, not just tidiness.
