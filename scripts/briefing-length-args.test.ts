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

  it('falls back to the default branch when --branch has no value', () => {
    expect(parseBriefingLengthArgs(['--branch'], '2026-09-24').branch).toBe('seed-template');
  });

  it('refuses anything but a plain branch name, so the shell only ever sees one', () => {
    expect(() => parseBriefingLengthArgs(['--branch', 'x; rm -rf /'], '2026-09-24')).toThrow(/branch name/);
  });
});

describe('words and sentences — how a reply is measured', () => {
  it('counts words on whitespace and sentences on terminal punctuation', () => {
    expect(words("Here's the read.\n\n**Adherence:** strong.")).toBe(5);
    expect(sentences('Strong overall. Skips cluster! Want more?')).toBe(3);
    expect(sentences('')).toBe(0);
  });
});
