import { describe, it, expect } from 'vitest';
import {
  changedRanges,
  emptyMeansMissed,
  mutateEntries,
  parseArgs,
  splitByChange,
  untouchedFiles,
  untrackedChange,
  type ChangedFile,
} from './scope';

/**
 * The gate grades what a change touched, and "touched" is read off
 * `git diff -U0 <base>`. These fixtures are real `-U0` output, captured from a
 * scratch repository, so the parser is held to what git actually prints.
 */

const MODIFIED = [
  'diff --git a/m.ts b/m.ts',
  'index 0fdf397..fd94124 100644',
  '--- a/m.ts',
  '+++ b/m.ts',
  '@@ -2 +2 @@ a',
  '-b',
  '+B',
  '@@ -4 +3,0 @@ c',
  '-d',
  '@@ -6,0 +6,2 @@ f',
  '+new1',
  '+new2',
].join('\n');

const ADDED = [
  'diff --git a/added.ts b/added.ts',
  'new file mode 100644',
  'index 0000000..8ba3a16',
  '--- /dev/null',
  '+++ b/added.ts',
  '@@ -0,0 +1,3 @@',
  '+n',
  '+o',
  '+p',
].join('\n');

const DELETED = [
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  'index b77b4eb..0000000',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-x',
  '-y',
].join('\n');

const RENAMED = [
  'diff --git a/old.ts b/renamed.ts',
  'similarity index 70%',
  'rename from old.ts',
  'rename to renamed.ts',
  'index 535d2b0..5be12ea 100644',
  '--- a/old.ts',
  '+++ b/renamed.ts',
  '@@ -8 +8 @@',
  '-8',
  '+EIGHT',
].join('\n');

const LOCALE = [
  'diff --git a/src/app/[locale]/p.ts b/src/app/[locale]/p.ts',
  'index e563bc2..4b1287e 100644',
  '--- a/src/app/[locale]/p.ts',
  '+++ b/src/app/[locale]/p.ts',
  '@@ -2 +2 @@ p',
  '-q',
  '+Q',
].join('\n');

describe('changedRanges — the lines a change added or modified', () => {
  it('reads nothing from an empty diff', () => {
    expect(changedRanges('')).toEqual([]);
  });

  it('takes a modified line from the new side of the hunk', () => {
    expect(changedRanges(LOCALE)).toEqual([{ file: 'src/app/[locale]/p.ts', ranges: [[2, 2]] }]);
  });

  it('keeps every hunk of a file, and a pure deletion adds no range', () => {
    // `-4 +3,0` removed line 4 and added nothing: there is no new line for a
    // test to be checking, so there is nothing to grade.
    expect(changedRanges(MODIFIED)).toEqual([
      {
        file: 'm.ts',
        ranges: [
          [2, 2],
          [6, 7],
        ],
      },
    ]);
  });

  it('treats a new file as changed from its first line to its last', () => {
    expect(changedRanges(ADDED)).toEqual([{ file: 'added.ts', ranges: [[1, 3]] }]);
  });

  it('leaves a deleted file out entirely', () => {
    expect(changedRanges(DELETED)).toEqual([]);
  });

  it('files a renamed file under its new name', () => {
    expect(changedRanges(RENAMED)).toEqual([{ file: 'renamed.ts', ranges: [[8, 8]] }]);
  });

  it('leaves out a rename that changed no content', () => {
    const pureRename = [
      'diff --git a/a.ts b/b.ts',
      'similarity index 100%',
      'rename from a.ts',
      'rename to b.ts',
    ].join('\n');

    expect(changedRanges(pureRename)).toEqual([]);
  });

  it('reads several files in one diff, each under its own name', () => {
    expect(changedRanges([ADDED, DELETED, MODIFIED, RENAMED].join('\n'))).toEqual([
      { file: 'added.ts', ranges: [[1, 3]] },
      {
        file: 'm.ts',
        ranges: [
          [2, 2],
          [6, 7],
        ],
      },
      { file: 'renamed.ts', ranges: [[8, 8]] },
    ]);
  });

  it('does not mistake an added line that begins "++ " for a file header', () => {
    // Inside a hunk, an added line reading `++ b/x.ts` is printed as
    // `+++ b/x.ts`. Taken as a header, it would move every later range onto
    // a file that was never in the diff.
    const tricky = [
      'diff --git a/t.ts b/t.ts',
      '--- a/t.ts',
      '+++ b/t.ts',
      '@@ -1,0 +1,2 @@',
      '+++ b/x.ts',
      '+line',
      '@@ -9 +10 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(changedRanges(tricky)).toEqual([
      {
        file: 't.ts',
        ranges: [
          [1, 2],
          [10, 10],
        ],
      },
    ]);
  });

  it('reads a Windows line ending, and a path with a space in it', () => {
    // git ends a `+++` name that holds a space with a tab.
    const crlf = [
      'diff --git a/sp ace.ts b/sp ace.ts',
      '--- a/sp ace.ts\t',
      '+++ b/sp ace.ts\t',
      '@@ -3 +3 @@',
      '-a',
      '+b',
    ].join('\r\n');

    expect(changedRanges(crlf)).toEqual([{ file: 'sp ace.ts', ranges: [[3, 3]] }]);
  });

  it('reads line numbers and counts of more than one digit', () => {
    const big = [
      'diff --git a/big.ts b/big.ts',
      '--- a/big.ts',
      '+++ b/big.ts',
      '@@ -120,15 +131,12 @@ export function x() {',
    ].join('\n');

    expect(changedRanges(big)).toEqual([{ file: 'big.ts', ranges: [[131, 142]] }]);
  });

  it('does not read an added line that looks like a hunk header as one', () => {
    const lookalike = [
      'diff --git a/t.ts b/t.ts',
      '--- a/t.ts',
      '+++ b/t.ts',
      '@@ -1,0 +1 @@',
      '+@@ -1 +500 @@',
    ].join('\n');

    expect(changedRanges(lookalike)).toEqual([{ file: 't.ts', ranges: [[1, 1]] }]);
  });

  it('does not cut the diff at a line that only mentions diff --git', () => {
    const mention = [
      'diff --git a/t.ts b/t.ts',
      '--- a/t.ts',
      '+++ b/t.ts',
      '@@ -1,0 +1,2 @@',
      '+// run diff --git a/x.ts b/x.ts',
      '+diff --git b',
      '@@ -9 +10 @@',
      '-a',
      '+b',
    ].join('\n');

    expect(changedRanges(mention)).toEqual([
      {
        file: 't.ts',
        ranges: [
          [1, 2],
          [10, 10],
        ],
      },
    ]);
  });
});

describe('parseArgs — what the run was asked to grade, and against what', () => {
  it('takes every non-flag argument as a path, grading the change by default', () => {
    expect(parseArgs(['src/a.ts', 'src/b.ts'])).toEqual({
      paths: ['src/a.ts', 'src/b.ts'],
      base: undefined,
      wholeFile: false,
    });
  });

  it('reads --whole-file, for the sweep that grades every function', () => {
    expect(parseArgs(['--whole-file', 'src/a.ts'])).toEqual({
      paths: ['src/a.ts'],
      base: undefined,
      wholeFile: true,
    });
  });

  it('reads --base <ref> without taking the ref for a path', () => {
    expect(parseArgs(['src/a.ts', '--base', 'origin/main', 'src/b.ts'])).toEqual({
      paths: ['src/a.ts', 'src/b.ts'],
      base: 'origin/main',
      wholeFile: false,
    });
  });

  it('reads --base=<ref> as the same thing', () => {
    expect(parseArgs(['--base=abc123', 'src/a.ts']).base).toBe('abc123');
  });

  it('ignores a flag it does not know rather than grading it as a path', () => {
    expect(parseArgs(['--verbose', 'src/a.ts']).paths).toEqual(['src/a.ts']);
  });
});

describe('mutateEntries — what Stryker is told to mutate', () => {
  it('names each changed range as path:start-end, and nothing else', () => {
    // Stryker includes a mutant only when its whole location sits inside a
    // range, so a survivor can only ever come from a line the change wrote.
    const changed = [
      {
        file: 'src/a.ts',
        ranges: [
          [3, 5],
          [20, 20],
        ] as [number, number][],
      },
    ];

    expect(mutateEntries(['src/a.ts'], changed)).toEqual(['src/a.ts:3-5', 'src/a.ts:20-20']);
  });

  it('leaves out a file the change did not touch', () => {
    const changed = [{ file: 'src/a.ts', ranges: [[1, 1]] as [number, number][] }];

    expect(mutateEntries(['src/a.ts', 'src/b.ts'], changed)).toEqual(['src/a.ts:1-1']);
  });

  it('leaves out a changed file that was not asked for', () => {
    const changed = [{ file: 'src/other.ts', ranges: [[1, 1]] as [number, number][] }];

    expect(mutateEntries(['src/a.ts'], changed)).toEqual([]);
  });

  it('still escapes a [locale] path when it carries a range', () => {
    // `[locale]` is a glob character class to Stryker; unescaped, it names
    // `src/app/l/…` and the run finds no file. `[[]` also reads as no glob at
    // all to Stryker's validator, which refuses a glob combined with a range.
    const changed = [
      {
        file: 'src/app/[locale]/[id]/x.ts',
        ranges: [[4, 9]] as [number, number][],
      },
    ];

    expect(mutateEntries(['src/app/[locale]/[id]/x.ts'], changed)).toEqual([
      'src/app/[[]locale]/[[]id]/x.ts:4-9',
    ]);
  });

  it('hands over whole files, escaped, when the run grades whole files', () => {
    // The shape the gate had before code-health/28, kept for the sweep.
    expect(mutateEntries(['src/a.ts', 'src/app/[locale]/x.ts'], null)).toEqual([
      'src/a.ts',
      'src/app/[[]locale]/x.ts',
    ]);
  });
});

describe('splitByChange — whose numbers decide the verdict', () => {
  const fn = (name: string, startLine: number, endLine: number, file = 'src/a.ts') => ({
    name,
    file,
    startLine,
    endLine,
  });
  const changed = [
    {
      file: 'src/a.ts',
      ranges: [
        [70, 70],
        [10, 12],
      ] as [number, number][],
    },
  ];

  it('counts a function whose span overlaps any changed range as touched', () => {
    const { touched, standing } = splitByChange(
      [
        fn('before', 1, 9),
        fn('startsInside', 12, 30),
        fn('endsInside', 5, 10),
        fn('around', 1, 40),
        fn('after', 13, 20),
      ],
      changed,
    );

    expect(touched.map((f) => f.name)).toEqual(['startsInside', 'endsInside', 'around']);
    expect(standing.map((f) => f.name)).toEqual(['before', 'after']);
  });

  it('matches ranges to functions by file', () => {
    const { touched } = splitByChange([fn('elsewhere', 1, 40, 'src/b.ts')], changed);

    expect(touched).toEqual([]);
  });

  it('touches everything when the run grades whole files', () => {
    const all = [fn('a', 1, 2), fn('b', 50, 60, 'src/b.ts')];

    expect(splitByChange(all, null)).toEqual({ touched: all, standing: [] });
  });
});

describe('untrackedChange — a file git has not been told about yet', () => {
  it('is changed from its first line to its last', () => {
    // `git diff <base>` does not show an untracked file at all. Read as
    // "unchanged", a brand-new module would never be graded.
    expect(untrackedChange('src/new.ts', 'a\nb\nc\n')).toEqual({
      file: 'src/new.ts',
      ranges: [[1, 3]],
    });
  });

  it('counts a last line with no newline after it', () => {
    expect(untrackedChange('src/new.ts', 'a\nb')).toEqual({
      file: 'src/new.ts',
      ranges: [[1, 2]],
    });
  });

  it('gives an empty file a one-line range rather than an impossible one', () => {
    // Stryker refuses a range whose end is before its start.
    expect(untrackedChange('src/new.ts', '')).toEqual({
      file: 'src/new.ts',
      ranges: [[1, 1]],
    });
  });
});

describe('emptyMeansMissed — when a run with no mutants is a run that missed', () => {
  // Stryker's own log line, as it prints it (colour codes and all).
  const found = (n: number) =>
    `\u001b[32m14:58:39 (7737) INFO ProjectReader\u001b[39m Found ${n} of 765 file(s) to be mutated.`;

  const A = ['src/a.ts'];
  const A_CHANGED: ChangedFile[] = [{ file: 'src/a.ts', ranges: [[1, 1]] }];

  it('never, when nothing was handed to Stryker for a file that changed', () => {
    // Every changed file exempt from mutation, like src/db/schema.ts.
    const schema = 'src/db/schema.ts';
    expect(emptyMeansMissed([schema], [], [{ file: schema, ranges: [[1, 1]] }], '')).toBe(false);
  });

  it('always, when whole files were handed over — the gate as it was', () => {
    expect(emptyMeansMissed(A, ['src/a.ts'], null, found(1))).toBe(true);
  });

  it('never, in whole-file mode, when every file was exempt from mutation', () => {
    expect(emptyMeansMissed(['src/db/schema.ts'], [], null, '')).toBe(false);
  });

  it('not when Stryker found every file: the changed lines held nothing to mutate', () => {
    // A change to a comment or a type alias has no mutant to offer, and that
    // is not the run failing to cover it.
    const files = ['src/a.ts', 'src/app/[locale]/b.ts'];
    const changed: ChangedFile[] = [
      { file: 'src/a.ts', ranges: [[3, 4], [12, 140]] },
      { file: 'src/app/[locale]/b.ts', ranges: [[1, 2]] },
    ];
    const mutate = ['src/a.ts:3-4', 'src/a.ts:12-140', 'src/app/[[]locale]/b.ts:1-2'];

    expect(emptyMeansMissed(files, mutate, changed, found(2))).toBe(false);
  });

  it('reads a count of more than one digit', () => {
    expect(emptyMeansMissed(A, ['src/a.ts:1-1'], A_CHANGED, found(10))).toBe(false);
  });

  it('when Stryker found fewer files than it was given', () => {
    // The [locale] failure: an entry that names no real file.
    const files = ['src/a.ts', 'src/b.ts'];
    const changed: ChangedFile[] = [...A_CHANGED, { file: 'src/b.ts', ranges: [[1, 1]] }];
    expect(emptyMeansMissed(files, ['src/a.ts:1-1', 'src/b.ts:1-1'], changed, found(1))).toBe(
      true,
    );
  });

  it('when the log does not say what Stryker found — fail closed', () => {
    expect(emptyMeansMissed(A, ['src/a.ts:1-1'], A_CHANGED, 'something else entirely')).toBe(true);
  });

  it('when no named file changed at all — graded nothing is not graded clean', () => {
    // The branch already in origin/main, or a --base holding the change.
    expect(emptyMeansMissed(A, [], [], '')).toBe(true);
  });

  it('when the diff named only other files', () => {
    // A path that does not match the one asked for, however it came about.
    expect(emptyMeansMissed(A, [], [{ file: 'rc/a.ts', ranges: [[1, 1]] }], '')).toBe(true);
  });

  it('not when one named file changed and another did not', () => {
    const files = ['src/a.ts', 'src/b.ts'];
    expect(emptyMeansMissed(files, ['src/a.ts:1-1'], A_CHANGED, found(1))).toBe(false);
  });
});

describe('untouchedFiles — the named files this run leaves ungraded', () => {
  it('names each file the change did not touch, in the order given', () => {
    const changed: ChangedFile[] = [{ file: 'src/b.ts', ranges: [[1, 1]] }];
    expect(untouchedFiles(['src/c.ts', 'src/b.ts', 'src/a.ts'], changed)).toEqual([
      'src/c.ts',
      'src/a.ts',
    ]);
  });

  it('names none when the run grades whole files', () => {
    expect(untouchedFiles(['src/a.ts'], null)).toEqual([]);
  });
});
