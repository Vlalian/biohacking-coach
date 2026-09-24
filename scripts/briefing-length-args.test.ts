import { describe, expect, it } from 'vitest';
import { parseBriefingLengthArgs, sentences, words } from './briefing-length-args';

describe('parseBriefingLengthArgs — what the script measures', () => {
  it('defaults to the two personas on seed-template, today, no call', () => {
    expect(parseBriefingLengthArgs([], '2026-09-24')).toEqual({
      names: ['Alex Rivera', 'Sam Chen'],
      branch: 'seed-template',
      call: false,
      today: '2026-09-24',
    });
  });

  it('takes names, a branch, a day and the call flag', () => {
    expect(parseBriefingLengthArgs(['--call', 'Nadia Holm', '--branch', 'dev/afk', '--today', '2026-09-01'], '2026-09-24')).toEqual({
      names: ['Nadia Holm'],
      branch: 'dev/afk',
      call: true,
      today: '2026-09-01',
    });
  });

  it('refuses --branch with no value rather than guessing', () => {
    expect(() => parseBriefingLengthArgs(['--branch'], '2026-09-24')).toThrow(/--branch needs a value/);
  });

  it('refuses an option where a value should be, instead of eating the next flag', () => {
    expect(() => parseBriefingLengthArgs(['--branch', '--call'], '2026-09-24')).toThrow(/--branch needs a value/);
    expect(() => parseBriefingLengthArgs(['--today', '--call'], '2026-09-24')).toThrow(/--today needs a value/);
    expect(() => parseBriefingLengthArgs(['--today'], '2026-09-24')).toThrow(/--today needs a value/);
  });

  it('refuses anything but a plain branch name, so the shell only ever sees one', () => {
    expect(() => parseBriefingLengthArgs(['--branch', 'x; rm -rf /'], '2026-09-24')).toThrow(/branch name/);
  });
});

describe('words and sentences — how a reply is measured', () => {
  it('counts words as runs of non-space, whatever the spacing around them', () => {
    expect(words("Here's the read.\n\n**Adherence:** strong.")).toBe(5);
    expect(words('  two   words ')).toBe(2);
    expect(words('')).toBe(0);
  });

  it('counts a sentence at each . ! or ? that ends a word run', () => {
    expect(sentences('Strong overall. Skips cluster! Want more?')).toBe(3);
    // A stop inside a number is not a sentence end; a stop at the very end is.
    expect(sentences('Ran 3.5 km. Done.')).toBe(2);
    // A run of marks ends one sentence, not two.
    expect(sentences('Wait?! Now.')).toBe(2);
    expect(sentences('a. b')).toBe(1);
    expect(sentences('')).toBe(0);
  });
});
