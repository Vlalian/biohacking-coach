# Make npm test pass out of the box

Label: wayfinder:task
Status: ready-for-agent
Blocked by: (none)
Map: ../MAP.md

## Question

Surfaced by [Refresh the POC README to the Weekly Session era](03-refresh-poc-readme-to-weekly-session-era.md): a fresh `npm install && npm test` in poc/ fails 4 of 31 tests. All four are in `test/conversation.buttons.test.mjs` and share one cause — jsdom doesn't implement `Element.scrollIntoView`, and `confirmNewSession` at `poc/public/js/conversation.js:163` calls it unguarded.

The README now points newcomers at `npm test`; a red suite on first contact misleads about project health. Fix the incompatibility (guard the call, or stub `scrollIntoView` in test setup — pick whichever matches the codebase's existing test idiom) and confirm 31/31 green. Resolution records the fix chosen and the passing run.
