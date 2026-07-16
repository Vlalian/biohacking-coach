Status: ready-for-agent
Label: wayfinder:task

# 08 — The Coach runs the Weekly Session and remembers it

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The Weekly Session ritual — Check-in → Review → Planning — running against Claude, with the whole conversation persisted server-side so it survives a refresh. The Coach reads the athlete's Session Reflections and builds the Week Plan, negotiating as a peer.

**This slice ports real code.** `poc/server.js` holds the prompt rendering behind five routes (`/api/negotiate`, `/api/weekly`, `/api/weekly/plan`, `/api/chat`, `/api/garmin/upload`), and `poc/test/server.prompts.test.mjs` plus `orchestrator.test.mjs` encode the prompt contract. Port the prompt rendering to TypeScript modules called from Next.js server actions or route handlers. The Express routing does not port; the prompt logic does.

Brings `conversations` and `messages` (ticket 05, ballot 4). This slice needs `kind: weekly_session`; the table serves all six kinds and the schema should not be narrowed to one. Persisting conversations fixes the POC's refresh-amnesia and is what later makes the Coach Briefing and the ai-transcripts visibility toggle real.

**The API key becomes a server secret.** [ADR 0006](../../../docs/adr/0006-server-authoritative-architecture.md) retires the POC's enter-your-key-in-the-UI pattern. The key is a Vercel environment variable read server-side only; no key field, no key in client code, no key in the browser.

**GDPR decision 1 carries forward unchanged: no real identity in prompts.** Training data keys off the opaque athlete ID and prompts must stay that way through the server migration — ADR 0006 calls this load-bearing for the whole GDPR posture, not tidiness. The Coach's language directive ports too: it responds in the athlete's language, with technical sports terms in English.

Retention and deletion of conversations are GDPR-track questions, not schema — do not decide them here.

## Acceptance criteria

- [ ] Prompt rendering is ported to TypeScript with its prompt-contract tests carried across and passing
- [ ] `conversations` and `messages` exist via migration, with `kind` covering all six kinds
- [ ] The athlete completes a Weekly Session: Check-in → Review → Planning, and it produces a Week Plan
- [ ] The Coach reads existing Session Reflections when reviewing
- [ ] The full transcript persists and is still there after a refresh
- [ ] Every conversation and message read or write resolves its owning athlete from the authenticated server session; a client-supplied conversation or athlete ID is checked against that owner, never trusted
- [ ] Asking for another athlete's conversation ID is refused server-side
- [ ] Messages carry `role` and `seq`; ordering is stable
- [ ] The Anthropic key is read server-side from an environment variable; it appears nowhere in client code or the UI
- [ ] No real name or email reaches a prompt — only the opaque athlete ID and training data
- [ ] The Coach responds in the athlete's language; technical sports terms stay English
- [ ] Tests cover prompt rendering, transcript persistence, the no-identity-in-prompts rule, and the refusal of another athlete's conversation ID

## Blocked by

`.scratch/eval-mvp-build/issues/04-calendar-renders-real-sessions.md`
`.scratch/eval-mvp-build/issues/07-session-reflection.md`

## Notes

Rate limiting on Claude-calling routes is named in the route's security-hardening item and is **not** decided yet. Do not invent a policy here; leave the route unlimited and let that ticket own it.
