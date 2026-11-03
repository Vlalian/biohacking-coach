import { describe, it, expect } from 'vitest';
import { classifySuppressions, suppressionsOf } from './suppressions';

/**
 * code-health/31: every suppression the gate lets through reaches Mads with its
 * reason. Stryker cannot supply that reason for the repo's own convention — it
 * reads one only after a colon, and `/onkel` prescribes an em-dash — so it is
 * read from the source, here.
 */

/**
 * The reason `suppressionsOf` reports for one Ignored mutant on `line` of
 * `src`. Stryker's own reason is 'stryker-own', so a mutant with no comment
 * block above it reads back as exactly that, on its own line.
 */
function reasonAt(src: string, line: number) {
  const [s] = suppressionsOf([{ file: 'a.ts', line, mutator: 'X', status: 'Ignored', ignoreReason: 'stryker-own' }], () => src);
  return { commentLine: s.commentLine, reason: s.reason };
}
const noBlock = (line: number) => ({ commentLine: line, reason: 'stryker-own' });

describe('suppressionsOf — the reason read from the comment above the mutant', () => {
  it('reads the reason after an em-dash on the comment above the mutant', () => {
    const src = [
      'const a = 1;',
      '// Stryker disable next-line ConditionalExpression — equivalent: both branches return 0',
      'return x ? 0 : 0;',
    ].join('\n');
    expect(reasonAt(src, 3)).toEqual({ commentLine: 2, reason: 'equivalent: both branches return 0' });
  });

  it('reads a colon reason and joins the comment lines that continue it', () => {
    const src = [
      '// Stryker disable next-line ArrayDeclaration: equivalent under the unit mock;',
      "//   atomicity is db.batch's",
      'await db.batch([a, b]);',
    ].join('\n');
    expect(reasonAt(src, 3)).toEqual({ commentLine: 1, reason: "equivalent under the unit mock; atomicity is db.batch's" });
  });

  it('returns a null reason when the directive carries none', () => {
    expect(reasonAt('// Stryker disable next-line StringLiteral\nconst s = "x";', 2)).toEqual({ commentLine: 1, reason: null });
  });

  it('finds no suppression when a line of code sits between the directive and the mutant', () => {
    const src = ['// Stryker disable next-line X — r', 'const a = 1;', 'const b = 2;'].join('\n');
    expect(reasonAt(src, 3)).toEqual(noBlock(3));
  });

  it('reads an indented comment block inside a function body', () => {
    const src = ['function f() {', '    // Stryker disable next-line EqualityOperator — equal keys give the same key', '    return a > b ? a : b;', '}'].join('\n');
    expect(reasonAt(src, 3)).toEqual({ commentLine: 2, reason: 'equal keys give the same key' });
  });

  it('stops the reason at the mutant line: a comment below the code is not part of it', () => {
    const src = ['// Stryker disable next-line X — equivalent', 'return a;', '// a note about the next function'].join('\n');
    expect(reasonAt(src, 2)).toEqual({ commentLine: 1, reason: 'equivalent' });
  });

  it('does not take a trailing comment on a code line for a directive block', () => {
    expect(reasonAt('const a = 1; // Stryker disable next-line X — r\nreturn a;', 2)).toEqual(noBlock(2));
  });

  it('gives no reason for a separator with nothing after it, or reason lines with no separator', () => {
    expect(reasonAt('// Stryker disable next-line X —\nreturn a;', 2)).toEqual({ commentLine: 1, reason: null });
    expect(reasonAt('// Stryker disable next-line X\n// equivalent\nreturn a;', 3)).toEqual({ commentLine: 1, reason: null });
  });

  it('finds no suppression on the first line of a file, or under a plain comment', () => {
    expect(reasonAt('const a = 1;', 1)).toEqual(noBlock(1));
    expect(reasonAt('// just a note\nconst a = 1;', 2)).toEqual(noBlock(2));
  });

  // CodeRabbit on PR #133: Stryker reads a directive only at the start of a comment.
  it('does not take a comment that quotes the directive mid-sentence for one', () => {
    expect(reasonAt('// write Stryker disable next-line X — reason\nconst a = 1;', 2)).toEqual(noBlock(2));
  });
});

describe('suppressionsOf', () => {
  const SRC = 'const a = 1;\n// Stryker disable next-line X — equivalent\nreturn a;';
  const mutant = (over = {}) => ({ file: 'src/a.ts', line: 3, mutator: 'X', status: 'Ignored', ...over });

  it('locates every Ignored mutant and reads its reason from the source', () => {
    expect(suppressionsOf([mutant(), mutant({ status: 'Killed', line: 1 })], () => SRC)).toEqual([
      { file: 'src/a.ts', line: 3, mutator: 'X', commentLine: 2, reason: 'equivalent' },
    ]);
  });

  it('falls back to Stryker’s own reason when no comment sits above, and to none when the file is unread', () => {
    expect(suppressionsOf([mutant({ line: 1, ignoreReason: 'excluded by config' })], () => SRC)).toEqual([
      { file: 'src/a.ts', line: 1, mutator: 'X', commentLine: 1, reason: 'excluded by config' },
    ]);
    expect(suppressionsOf([mutant()], () => undefined)).toEqual([
      { file: 'src/a.ts', line: 3, mutator: 'X', commentLine: 3, reason: null },
    ]);
  });
});

describe('classifySuppressions', () => {
  const a = { file: 'src/a.ts', line: 10, mutator: 'X', commentLine: 9, reason: 'r1' };
  const b = { file: 'src/a.ts', line: 40, mutator: 'Y', commentLine: 39, reason: 'r2' };

  it('lists a suppression whose comment line is in the diff as new, the rest as already there', () => {
    expect(classifySuppressions([a, b], [{ file: 'src/a.ts', ranges: [[5, 12]] }])).toEqual({ new: [a], existing: [b] });
  });

  it('counts a comment on either edge of a changed range as new, and one in another file as not', () => {
    const elsewhere = { ...a, file: 'src/b.ts' };
    expect(classifySuppressions([a, b, elsewhere], [{ file: 'src/a.ts', ranges: [[9, 9], [39, 40]] }])).toEqual({ new: [a, b], existing: [elsewhere] });
    expect(classifySuppressions([a], [{ file: 'src/a.ts', ranges: [[10, 12]] }])).toEqual({ new: [], existing: [a] });
  });

  it('matches the suppression against the file it is in, among several changed files', () => {
    const changed = [
      { file: 'src/z.ts', ranges: [[1, 100]] as [number, number][] },
      { file: 'src/a.ts', ranges: [[1, 2], [9, 9]] as [number, number][] },
    ];
    expect(classifySuppressions([a, b], changed)).toEqual({ new: [a], existing: [b] });
  });

  it('lists everything unsplit when there is no diff to compare', () => {
    expect(classifySuppressions([a], null)).toEqual({ unsplit: [a] });
  });
});
