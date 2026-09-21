# Check a document's claim about the code against the code

When a tracker file, ADR, or decision log states something factual about the
code — "X never happens", "**Where enforced:** `some/file.js`", "this table
carries no name column" — **read the code before you repeat it.** Mads's standing
instruction, 2026-07-17.

The claim to distrust most is the one naming its own enforcement point, because
that is the one everybody downstream relies on.

Rules that follow:

- **Before repeating a factual claim about the code, grep for it.** It costs
  seconds. Being wrong costs a consent artifact that lies to a third party.
- **A "Where enforced" line is a hypothesis, not a citation.** Open the function.
- **An instruction in a system prompt is not a control.** If the model must not
  use a value, do not send it.
- **When a document and the code disagree, the code is what is true.** Fix the
  document, and say plainly that it was wrong rather than quietly editing it —
  the record of what was believed is worth keeping.

## What earned this rule

`gdpr-decisions.md` decision 1 said the athlete's name "is **never sent to the
Anthropic API**", and named the enforcement point: "`poc/server.js` — all
`buildCoachContext`, `buildWeeklyContext`, and `buildChatPrompt` functions." All
of it false, and false from the start:

- `poc/public/index.html` has a settings field labelled **Name**, placeholder
  **"Your name"**.
- `app.js` stores it as `profile.personaName`.
- `buildWeeklyContext` — a named enforcement point — passes `personaName`
  straight through.
- `renderWeeklyPrompt` interpolates it:
  `` `…pulse=${pulse}bpm${personaName ? ` athlete=${personaName}` : ''}` ``.

So the app asked the athlete for their real name and sent it to Anthropic. The
Coach Chat prompt's "Never use or reference the athlete's real name" is not a
control either — it asks the model to ignore a name we just handed it.

On 2026-07-17 that false sentence was repeated into **four documents in one
session** — a route ticket, a decision log, the map, and a build slice — while
ruling a GDPR posture that *leaned on it*. Nobody had looked. The same session
had already closed
[route tickets 06, 07 and 08](../../.scratch/coach-eval-mvp-route/), all three
of which were documents disagreeing with code. That is three warnings and a
fourth incident.
