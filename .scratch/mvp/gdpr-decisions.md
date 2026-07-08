Status: living document — update as decisions are made or reversed
Last updated: 2026-07-08 (rating terminology aligned to the shipped RPE 1–10 scale; no decisions changed)

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

No demographic data, no location, no wearable biometric streams, no health records. The coaching intelligence is derived from self-reported subjective signals, not from medical or fitness tracking integrations (those are V2).

---

### 6. Zero data retention — flagged, not yet implemented
Anthropic's API, by default, may use prompt and response data for safety research and model improvement. This is incompatible with handling health-adjacent data without explicit user consent and a data processing agreement.

**What's needed:**
- A **Data Processing Agreement (DPA)** with Anthropic — available on request for enterprise customers
- A **zero data retention** agreement or the equivalent opt-out mechanism
- This may require the enterprise API tier

**Current POC status:** A comment in `poc/server.js` (`buildChatPrompt`) flags this as a TODO. The privacy notice shown to athletes in Coach Chat explicitly warns that conversations are AI-processed.

**This must be resolved before real user data is handled.** Do not launch MVP without it.

---

## Deferred decisions (MVP or later)

### A. Lawful basis for processing
GDPR requires a lawful basis for processing personal data. For health-adjacent data (Article 9), the most appropriate basis is **explicit consent**. The current POC has no consent mechanism.

**MVP requirement:** An onboarding consent flow that:
- Explains what data is collected and why
- Names Anthropic as a data processor
- Explicitly covers processing of health-related signals
- Allows withdrawal of consent (right to erasure flow)

---

### B. Data subject rights
GDPR grants users the right to access, correct, and erase their data. The current POC has no mechanism for any of these.

**MVP requirement:** At minimum, a "Delete all my data" option that clears localStorage and any server-side records. If coach conversation history is stored server-side (as planned for the MVP data layer), a full data export + erasure flow is required.

---

### C. Server-side data storage GDPR implications
The MVP architecture plans for SQLite + SQLCipher on-device storage for the Athlete Profile. If this moves to server-side storage (required for multi-device access, push notifications, or analytics), the full GDPR obligation for stored personal data applies:
- Data residency: Anthropic processes in the US by default; EU data residency requires their enterprise tier or a different model provider
- Standard Contractual Clauses (SCCs) may be required for EU → US data transfers
- Privacy policy and DPA must cover the server-side storage provider

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

1. Does subjective self-reported training data (body readiness, mental state, energy on a 1–10 scale) constitute health data under Article 9 GDPR, or is it ordinary personal data? The answer determines the required level of protection.
2. Is a privacy notice sufficient for Coach Chat free-text, or is explicit granular consent required for each conversation?
3. What SCCs or transfer mechanisms are needed for EU athlete data processed via Anthropic's US-based API?
4. Is the "legitimate interests" lawful basis viable for any part of this processing, or is explicit consent required throughout?
5. Who is the data controller — the app operator (Mads / the company), Anthropic, or both? What DPA structure does this require?
