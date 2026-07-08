# Make npm test pass out of the box

Label: wayfinder:task
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

Surfaced by [Refresh the POC README to the Weekly Session era](03-refresh-poc-readme-to-weekly-session-era.md): a fresh `npm install && npm test` in poc/ fails 4 of 31 tests. All four are in `test/conversation.buttons.test.mjs` and share one cause — jsdom doesn't implement `Element.scrollIntoView`, and `confirmNewSession` at `poc/public/js/conversation.js:163` calls it unguarded.

The README now points newcomers at `npm test`; a red suite on first contact misleads about project health. Fix the incompatibility (guard the call, or stub `scrollIntoView` in test setup — pick whichever matches the codebase's existing test idiom) and confirm 31/31 green. Resolution records the fix chosen and the passing run.

## Resolution

Done 2026-07-08. The stub alone would not have fixed it — diagnosis found a second, deeper cause: `conversation.js` keeps conversation history at module level, so after the first test the module thinks a conversation is active and `startWeeklySession`/`startCoachChat` route into `confirmNewSession()`, which awaits a banner click that never comes in a test. The four tests were written before that banner existed (added ~2026-06-26) and were never re-run — vitest wasn't even installed in node_modules until this map's README ticket ran `npm install`.

Fix (test-side only, no product code touched): a shared `beforeEach` in `conversation.buttons.test.mjs` does `vi.resetModules()` + dynamic re-import of conversation.js (fresh module state per test) and stubs `Element.prototype.scrollIntoView` (not implemented in jsdom). Verified: `npm test` → **31/31 passed, 4/4 files green**.
