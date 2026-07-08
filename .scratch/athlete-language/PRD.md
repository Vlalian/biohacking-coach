Status: done

# PRD — Athlete Language

## Problem Statement

The app and the Coach always communicate in English, regardless of the athlete's preferred language. Danish athletes (the primary target market for the POC) experience a product that does not feel native to them. The Coach's tone and the UI's language are fixed.

## Solution

Add a language preference to the athlete profile, set during MCQ onboarding. The Coach responds in the athlete's language. All UI text follows the same language. Technical sports terms (RPE, FTP, CSS, Zone 2, Ironman, etc.) remain in English regardless of the athlete's language — they are international standards in the sport.

V1+ adds a settings screen to change the language preference after onboarding.

## User Stories

1. As a Danish Ironman trainee, I want the Coach to talk to me in Danish so the coaching experience feels natural and personal.
2. As a Danish Ironman trainee, I want the app's UI labels, buttons, and status text to be in Danish so the interface is fully native.
3. As an athlete, I want technical training terms (RPE, FTP, Zone 2, Ironman, CSS) to remain in English regardless of my language, because they are the same in every language I train in.
4. As an athlete, I want my language preference set once during onboarding and remembered for all future sessions.
5. As an athlete, I want the Coach to switch language immediately when I change my preference, without resetting my profile or history.

## Implementation Decisions

### Language storage

`language` is added to the athlete profile: `'da'` for Danish, `'en'` for English. Set via MCQ onboarding button selection. Stored as `bca_language` in localStorage.

### Coach language directive

The system prompts for all Coach sessions (daily session, weekly session, Coach Chat) include a language directive: "Respond in [language]. Technical training terms (RPE, FTP, Zone 2, Ironman, CSS, etc.) remain in English."

The Coach is not given a translation list — it uses its own language capability. The directive is sufficient for fluent, natural responses in the athlete's language.

### UI language

UI strings (button labels, status text, headings, modal titles) are rendered in the athlete's language. For the POC, this means maintaining two sets of strings: English and Danish. A simple key-based string lookup (`t('save')` → `'Gem'` or `'Save'`) is sufficient — no i18n framework needed at POC scale.

RAG (retrieval-augmented generation) or translation layers are V1 concerns. For the POC, the Coach's built-in Danish capability combined with the language directive is sufficient.

### Technical terms exception

The language directive explicitly lists terms that must stay in English. The Coach does not translate: RPE, FTP, CSS, Zone 1–5, Ironman, 70.3, brick, tempo, threshold, VO2max, CTL, ATL, TSB, HRV. These are part of the athlete's existing vocabulary regardless of their native language.

### Settings (V1)

A language toggle in the app settings allows the athlete to change their language preference after onboarding. Changing the setting immediately updates `bca_language` and applies to all subsequent Coach responses and UI rendering. Not in scope for POC.

## Testing Decisions

Good tests verify that the language directive reaches the Coach prompt and that the UI renders in the correct language.

**Seam A — Coach prompt:** Given `bca_language = 'da'`, the system prompt passed to any Coach session contains the Danish language directive. Given `bca_language = 'en'`, the prompt contains the English directive.

**Seam B — UI rendering:** Given `bca_language = 'da'`, the "Save" button renders "Gem" and the "Mark as skipped" button renders "Marker som sprunget over" (or equivalent).

Manual verification: complete onboarding selecting Danish, confirm Coach responds in Danish and uses English for technical terms.

## Out of Scope

- Languages other than Danish and English — V1
- Right-to-left language support
- Automatic language detection from the athlete's device locale — V1
- Translation of historical session notes already stored in another language

## Further Notes

The language preference is set in MCQ Onboarding and consumed here. The MCQ Onboarding PRD is a prerequisite — the `language` field must exist in the profile before this feature can be implemented.

The Coach's language capability means this feature requires no translation database or external service. The directive approach is robust because the Coach understands Danish training terminology naturally — there is no risk of it translating "Zone 2" to "Zone 2" awkwardly.

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): all child issues done and feature verified present in the POC. Status set to done.
