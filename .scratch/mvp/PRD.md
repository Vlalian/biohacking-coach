Status: ready-for-agent

# MVP PRD — Biohacking Coach App

## Problem Statement

Ironman trainees spend 6–12 months following training plans that treat their subjective experience as noise. Generic AI coaching tools give the same advice regardless of how the athlete slept, how their body feels, or where their head is. Human coaches bridge this gap through contextual memory, emotional attunement, and iterative trust-building — but are expensive and unavailable on demand. The result: athletes train suboptimally, miss recovery signals, and disengage from rigid plans that don't adapt to them as individuals.

## Solution

A luxury AI coaching app for Ironman trainees that treats the athlete's subjective experience — their Body Feedback and Mind Feedback — as the primary coaching signal. A Coach agent holds the athlete's full individual context, conducts daily Check-ins, leads Session Negotiation with visible reasoning, and captures Session Reflections after every session. Over time, the Coach detects Pattern Insights the athlete may not notice themselves and surfaces them conversationally. All personal data stays on-device. The Coach communicates with Peer Authority: confident, evidence-led, and direct — a knowledgeable peer, not a prescription machine or a subservient assistant.

## User Stories

1. As an Ironman trainee, I want to complete a structured Onboarding Session with the Coach so that it understands my fitness level, training history, race target, motivations, and communication preferences before advising me.
2. As an Ironman trainee, I want the Coach to infer my Training Phase from my race date and experience level so that I never have to configure periodization manually.
3. As an Ironman trainee, I want to complete a daily Check-in in under 30 seconds so that the Coach has current context before every interaction.
4. As an Ironman trainee, I want the Check-in to capture my body readiness, mental state, and perceived energy so that the Coach can factor all three into its recommendation.
5. As an Ironman trainee, I want to complete a Session Priming ritual before training so that I am mentally prepared and the Coach can confirm session intent.
6. As an Ironman trainee, I want the Coach to open Session Negotiation with a clear recommendation and visible reasoning so that I understand why it is suggesting what it is.
7. As an Ironman trainee, I want to push back on the Coach's recommendation and have my reasoning captured so that my resistance becomes part of my Athlete Profile over time.
8. As an Ironman trainee, I want the Coach to ask me what my body wants before revealing its recommendation on some sessions so that I build body awareness rather than Coach dependency.
9. As an Ironman trainee, I want the Coach to cross-reference my self-reported state against Contextual Signals (sleep, resting pulse, time of day) so that its recommendations are grounded in more than my words alone.
10. As an Ironman trainee, I want the Coach to name its uncertainty explicitly when signals conflict so that I trust it more, not less.
11. As an Ironman trainee, I want to confirm or modify the session after Session Negotiation so that I remain the final decision-maker about what I train.
12. As an Ironman trainee, I want to capture Body Feedback after a session so that the Coach knows how my body responded to the training load.
13. As an Ironman trainee, I want to capture Mind Feedback after a session so that the Coach knows how I felt mentally and emotionally about the session.
14. As an Ironman trainee, I want my Body Feedback and Mind Feedback to be stored locally and grow my Athlete Profile session by session so that the Coach's understanding of me deepens over time.
15. As an Ironman trainee, I want the Coach to surface Pattern Insights when it detects cross-variable patterns in my history so that I learn things about myself I wouldn't notice alone.
16. As an Ironman trainee, I want the Coach to adapt its tone and framing to my current emotional state via Coach Awareness so that the interaction feels attuned, not generic.
17. As an Ironman trainee, I want Coach Awareness to be visible — acknowledged in the conversation — so that I feel heard rather than processed.
18. As an Ironman trainee, I want my personal data to never leave my device as personally identifiable information so that I trust the app with sensitive health and emotional data.
19. As an Ironman trainee, I want the Privacy Proxy to construct anonymised queries to the Knowledge Oracle so that training science is applied to my situation without exposing who I am.
20. As an Ironman trainee, I want the Coach to use Session Context — a curated selection of my relevant history — in every interaction so that each session benefits from my accumulated Athlete Profile without sending my entire history to a cloud server.
21. As an Ironman trainee, I want the Coach to project my Trajectory — what consistent training could unlock — so that I stay motivated through the long build.
22. As a beginner Ironman trainee, I want Trajectory Projections to be aspirational — showing what Ironman training can unlock for someone like me — so that I stay motivated through uncertainty.
23. As a veteran Ironman trainee, I want Trajectory Projections to show my own progression data — what I have built over time — so that I am motivated by my own history.
24. As an Ironman trainee, I want deeper features (trend analysis, pattern overlays) to be unlocked progressively by the Coach as I build history, not all at once in a settings menu, so that the product grows with me.
25. As an Ironman trainee, I want to answer a brief post-session micro-survey question (rotating between Coach attunement, session fit, and trust signal) so that the product team can measure whether the Coach is genuinely helping.

## Implementation Decisions

### Agent Architecture
- Four agents: Coach (user-facing), Knowledge Oracle (research), Tone Adaptation (invisible processing step on every Coach output), Integration Broker (V2 only — out of MVP scope).
- The athlete interacts with the Coach only. Tone Adaptation has no identity visible to the athlete.
- Coach Awareness is the athlete-visible surface expression of Tone Adaptation.

### Coach Communication Posture
- Peer Authority: evidence first, conclusion direct, genuine invitation for athlete response. No hedging, no deference.
- Declared Uncertainty when signals conflict or history is insufficient.
- Reflective Prompts used sparingly early, increasingly as athlete matures.

### Data Architecture
- Local-first. All Athlete Profile data — Check-ins, Session Reflections, Body Feedback, Mind Feedback, Pushback Rationale, Contextual Signals — stored on-device in SQLite with SQLCipher encryption.
- Local vector store holds embeddings of athlete history, queryable per session.
- Privacy Proxy constructs anonymised Knowledge Oracle queries from structured fields only. Free-text never reaches external LLMs in MVP.
- Session Context: device selects and injects relevant history chunks into each Coach prompt. Hosted LLM never accesses raw local store.

### Onboarding
- Single structured Onboarding Session mirrors a real coach intake conversation.
- Seeds Athlete Profile with: fitness level, experience level, training history, race target, motivations, communication preference.
- Training Phase inferred from race date and experience level. Never manually configured by athlete.
- Experience level is a first-class Athlete Profile field — shapes Training Phase definitions, Trajectory Projection framing, and Progressive Disclosure pacing.

### Session Flow
- Daily: Check-in → (training day) Session Priming → Session Negotiation → training → Session Reflection
- Session Negotiation: Coach opens with recommendation + visible reasoning. Athlete accepts, pushes back, or proposes alternative. Pushback Rationale captured. Session confirmed when aligned.
- Reliance Calibration: Coach invisibly tracks consistency between athlete self-reports, Contextual Signals, and outcomes to calibrate weighting over time.

### MVP Contextual Signals
- Self-reported only in MVP: sleep duration, resting pulse (manual entry), time of day.
- Wearable-sourced signals deferred to V2 (Integration Broker).

### LLM Strategy
- Hosted frontier models (Claude or GPT-4 class). No local on-device LLM.
- MVP: hosted API + RAG + strong system prompts. Fine-tuning post-MVP once real conversation data is collected.
- Knowledge Oracle RAG knowledge base: Ironman periodization research, Joe Friel's Triathlete's Training Bible, peer-reviewed physiology literature.
- Tone Adaptation knowledge base: BJ Fogg's Tiny Habits, James Clear's Atomic Habits, Self-Determination Theory, motivational interviewing patterns.

### UI
- Loveable for MVP prototyping. React Native for V1+.
- Luxury, calm, conversational. Dark UI, muted tones, slow transitions, generous whitespace.
- Three primary surfaces: Check-in, Session Negotiation, Session Reflection.
- Progressive Disclosure: Coach-initiated, conversational — never a settings toggle.

## Testing Decisions

Good tests verify behaviour through the seams below, not implementation details. They should survive internal refactors.

### Seams

1. **Coach prompt pipeline** — given a Session Context and Check-in state, does the Coach produce a recommendation with visible reasoning in Peer Authority voice?
2. **Privacy Proxy** — given an Athlete Profile with PII, does the anonymised Knowledge Oracle query contain zero identifying information?
3. **Check-in capture** — given athlete slider and optional text input, is a correctly structured Check-in state stored locally?
4. **Session Negotiation flow** — given a Coach recommendation and an athlete pushback, is the Pushback Rationale captured and stored in the Athlete Profile?
5. **Session Reflection capture** — given Body Feedback and Mind Feedback input, is a structured record appended to the local RAG store?

### Prior art
No existing codebase. Tests should be written TDD-style as each module is built, starting with the Privacy Proxy (highest risk, most auditable) and Check-in capture (highest frequency, simplest seam).

## Out of Scope (MVP)

- Wearable and API integrations (Integration Broker — V2)
- Nutrition and food tracking
- Gadget and supplement evaluation
- Peer comparison and community features
- Business model and payments
- Fine-tuning (post-MVP, after real conversation data collected)
- Fully local on-device LLM
- Automatic sleep/HRV data ingestion (self-reported only in MVP)

## Further Notes

- **Domain expert interview completed (2026-06-22).** Key validated and revised decisions:
  - **RPE 1–10** replaces the 1–5 emoji scale for Body Feedback and Mind Feedback. This is the coaching industry standard and what serious athletes use. Visual element (emoji or colour) is retained alongside the numeric scale.
  - **Pattern Insight surfacing** — not always invisible. When a pattern is consistent across multiple weeks, the Coach should name it as an observation and normalisation during the Weekly Session (e.g. "I've noticed intensity sessions consistently score lower on your mind rating — that's common in this phase"). Framing: observation, never criticism.
  - **Session skips require no real-time explanation.** The athlete marks a session as not done and moves on. Context (why it was skipped) comes naturally in the next Weekly Session. Session Negotiation is reserved for when the athlete actively wants to negotiate an alternative, not for simple skips.
  - **Weekly Session planning order reversed.** Coach proposes the Week Plan first, then asks if it fits the athlete's life. The athlete does not declare constraints before seeing the plan.
  - **Athlete can self-service move sessions** within the week without triggering Session Negotiation. Convenience drag/reschedule in the Training Plan calendar.
  - **Coaching Closing Move validated.** Every Weekly Session ends with open door + motivational send-off. This is the standard formula used by real coaches.
  - **Experience-Adaptive UX refined.** Veterans want the plan first and react only if needed. Beginners need the reasoning explained ("you have heavy legs but this is pre-recovery week — that's intentional"). Luxury = training works + feels personal + fits daily life.
  - **Carbohydrate intake** as a common comment field use case for serious athletes. Comment field in Session Feedback should prompt this but not require it.
  - **Monthly Review Session** identified as a V1 feature — real coaches do a ~monthly big-picture conversation alongside the weekly rhythm. Out of MVP scope but on the V1 roadmap.
  - **Training phases and session types** not validated by expert (insufficient expertise). Validate against Joe Friel's Triathlete's Training Bible before MVP build.
  - **Luxury defined.** For Ironman athletes: training works + feels personal (knows your weaknesses and strengths) + fits into daily life. Not about aesthetics or UI polish.
- **MVP success metrics:** retention past day 10; Session Negotiation engagement rate (active pushback = trust signal, not passive compliance); qualitative micro-survey (rotating: Coach attunement, session fit, trust signal) + structured exit interviews with first 5–10 users.
- **HI patterns applied:** this PRD incorporates HI Design Playbook patterns 3 (Frictional AI → Reflective Prompt), 4 (Seamful Design → Declared Uncertainty), 5 (Metacognitive Reflection → Pattern Insight), 7 (Judgment Explicitation → Pushback Rationale), 8 (Human Expertise Amplification → Peer Authority), and 10 (Adaptive Trust Architecture → Reliance Calibration).
- **GDPR:** local-first architecture + Privacy Proxy significantly reduce exposure. Legal review required before launch. Explicit opt-in consent required. Data processing agreements needed with LLM providers.
