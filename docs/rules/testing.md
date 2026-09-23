# Writing tests

The standard here is Holub's: **you must be able to change how a module is
implemented without changing its tests.** A test that breaks when the behaviour
did not change was testing the shape of the code, not the promise it makes.

**Rule 2 describes what the suite already does**: as of 2026-09-22 every
`vi.spyOn` in `src/` and `e2e/` targets `console.error` or `console.warn`, both
boundaries. Rule 1 does not yet. The same day's measurement found 79 exports
with no non-test caller that are used inside their own file — the
export-for-test shape — and 12 more with no consumer outside tests at all.

Those 91 are **grandfathered, and tracked** in
`.scratch/code-health/issues/19-exports-with-no-caller-but-a-test.md`, to be
swept in slices. They are not a licence: new code follows the rule from today,
and a file you are already editing for another reason is a file whose violations
you fix while you are in there.

- **Colocate tests** with the code they test (`calc-load.ts` next to
  `calc-load.test.ts`).

## 1. Test the exports, and only the exports

A module's interface is what it `export`s. A test may call those and nothing
else. Each export must have a caller somewhere in the repo that is not a test —
`src/`, but `scripts/`, `e2e/` and `playwright/` count too, and the measurement
behind code-health/19 counts them. An export whose only consumer is a test file
is not an interface, it is a backdoor with `export` written in front of it.

For a repository or server action the interface is the signature plus the rows
it writes. For a component it is props in, rendered DOM out: assert on what the
athlete sees, never on which hook ran.

## 2. Spies are for boundaries, never for internals

`vi.spyOn` is legitimate on the edge of the system — `console`, the clock, the
database, the Anthropic client, `fetch`. It is never legitimate on a function
defined in the file under test.

```ts
// Fine: console is the log transport, a real boundary.
vi.spyOn(console, "error").mockImplementation(...)

// Banned: asserts the call graph, not the behaviour. This passes even when
// normalizeHr returns garbage.
const spy = vi.spyOn(mod, "normalizeHr");
sessionLoad({ hr: 250, minutes: 60 });
expect(spy).toHaveBeenCalledWith(250);
```

## 3. When a private helper is hard to reach, extract it

If covering a private helper's branches through the module's interface takes a
page of setup per case, that is a signal, not an obstacle: the helper is doing
work the interface never really exposes. Move it into its own module with real
exports. Its tests then *are* interface tests, and the hardening gate grades it
properly. This is the right answer most of the time.

## 4. Export-for-test is a marked exception

When the helper genuinely does not deserve its own module, exporting it for a
test is allowed on one condition: a comment on the export saying why the
interface path was too costly.

```ts
// Export-for-test: reaching the 12 HR-clamp branches through sessionLoad needs
// a full Session per case. Delete freely if this helper is inlined.
export function normalizeHr(raw: number): number { ... }
```

The comment is what makes rule 5 decidable.

## 5. When a refactor breaks a test

A refactor changes how, never what. So which test broke tells you what happened:

- **A marked export-for-test broke** (the helper was inlined or renamed):
  delete it. No permission needed. It existed to reach a shape that is gone.
- **An interface test broke**: stop. This is not a refactor, it is a behaviour
  change. Do **not** edit the test to match the new output. Leave it failing and
  say so, the way [definition-of-done.md](definition-of-done.md) requires of any
  failing check.
- **A boundary spy broke**: treat it as an interface test — the case above.

## 6. A deletion is only valid if the numbers hold

After deleting a test under rule 5, `/onkel`'s mutation score and coverage on
the touched files must be at or above what they were before. If deleting the
internal test lets a mutant survive, the behaviour it covered was real and no
interface test reaches it — so the deletion is refused, and that branch needs an
interface test instead.

Every test deleted during a refactor is named in the agent's report with its
reason. A silent deletion is the same failure mode as a silently skipped check.

## Why not test internals to catch bloat

Unnecessary code — the kind an LLM adds without noticing — shows up as a
surviving mutant, an uncovered line, or a high CRAP score. `/onkel` measures all
three already, and it measures them the same whether the line was reached
through the interface or directly. Mutation testing changes the *implementation*
and asks whether any test notices; an interface test notices just as well. So
internal tests buy nothing here that rule 3 does not buy more cheaply.
