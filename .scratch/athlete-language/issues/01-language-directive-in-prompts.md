Status: done

# 01 — Language Directive in Coach Prompts

## Parent

`.scratch/athlete-language/PRD.md`

## What to build

Read the athlete's stored `language` preference and inject a language directive into all Coach system prompts (daily session, weekly session, Coach Chat). The directive tells the Coach which language to respond in and explicitly lists technical sports terms that must remain in English.

Directive format (Danish example):
"Respond in Danish. The following terms always stay in English: RPE, FTP, CSS, Zone 1-5, Ironman, 70.3, brick, tempo, threshold, VO2max, CTL, ATL, TSB, HRV."

When `language` is `'en'` or not set, no directive is needed — the Coach defaults to English.

## Acceptance criteria

- [ ] An athlete with `language: 'da'` receives Coach responses in Danish
- [ ] Technical training terms (RPE, FTP, Zone 2, etc.) remain in English in Danish-language responses
- [ ] An athlete with `language: 'en'` receives Coach responses in English (unchanged behaviour)
- [ ] The language directive is present in the system prompt for daily session, weekly session, and Coach Chat
- [ ] Changing `bca_language` in localStorage immediately applies to the next Coach session

## Blocked by

`.scratch/mcq-onboarding/issues/01-mcq-flow-core-fields.md`
