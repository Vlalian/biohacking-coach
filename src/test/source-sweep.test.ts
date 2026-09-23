import { describe, it, expect } from 'vitest';
import {
  codeOf,
  filesMatching,
  filesMatchingRaw,
  rawOf,
  relativeToSrc,
  sourceFiles,
  srcPath,
  SWEEP_TIMEOUT_MS,
} from './source-sweep';
import { SWEEP_FIXTURE_NAME } from './sweep-fixture';

/**
 * The shared walk the whole-codebase guards run on. It is test infrastructure,
 * which is exactly why it is specified: a sweep that quietly finds nothing —
 * wrong root, comments stripped too eagerly, tests filtered out by accident —
 * makes every guard built on it pass while proving nothing.
 *
 * This file is its own fixture: it contains the strings the assertions below
 * look for, in code and in comments. BLOCK_MARKER: sweepBlockMarker.
 */
describe('sourceFiles', () => {
  it('walks src/, finds only TypeScript, and returns the same array on every call', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(200);
    expect(files.every((f) => /\.tsx?$/.test(f))).toBe(true);
    expect(files).toContain(srcPath('test/source-sweep.ts'));
    expect(files).toContain(srcPath('features/athlete/uuid-v5.ts'));
    // Cached: a second walk would be a second array.
    expect(sourceFiles()).toBe(files);
  }, SWEEP_TIMEOUT_MS);

  it('drops test files on request — both .test.ts and .test.tsx — and nothing else', () => {
    const production = sourceFiles(false);
    expect(production).not.toContain(srcPath('test/source-sweep.test.ts'));
    expect(production).not.toContain(srcPath('components/change-password-form.test.tsx'));
    expect(production).toContain(srcPath('test/source-sweep.ts'));
    expect(production).toContain(srcPath('components/change-password-form.tsx'));
    expect(production.length).toBeLessThan(sourceFiles().length);
    expect(production.every((f) => !/\.test\.tsx?$/.test(f))).toBe(true);
  }, SWEEP_TIMEOUT_MS);
});

describe('codeOf and rawOf', () => {
  const self = srcPath('test/source-sweep.test.ts');

  // Written in halves everywhere they are asserted, so the only whole
  // occurrence of each is the one in a comment. LINE_MARKER: sweepLineMarker.
  const LINE_MARKER = 'sweepLine' + 'Marker';
  const BLOCK_MARKER = 'sweepBlock' + 'Marker';

  it('strips both comment styles, and keeps the code around them', () => {
    const code = codeOf(self);
    expect(code).not.toContain(LINE_MARKER);
    expect(code).not.toContain(BLOCK_MARKER);
    expect(code).toContain('describe');
    expect(code).toContain('sweepLine');
  }, SWEEP_TIMEOUT_MS);

  it('leaves a space where a comment was, so the tokens around it stay apart', () => {
    // Read from a fixture, not from this file: a guard that reads its own text
    // can pass by matching its own description.
    const code = codeOf(srcPath(SWEEP_FIXTURE_NAME));
    expect(code).toContain("'sweepFixtureLeft' +'sweepFixtureRight'");
    expect(code).not.toContain("'sweepFixtureLeft'+'sweepFixtureRight'");
  }, SWEEP_TIMEOUT_MS);

  it('drops a line comment, and keeps the code before it', () => {
    const code = codeOf(srcPath(SWEEP_FIXTURE_NAME));
    expect(code).toContain("sweepFixtureLine = 'kept'");
    expect(code).not.toContain('sweepFixtureLineComment');
    expect(code).not.toContain('sweepFixtureProseOnly');
  }, SWEEP_TIMEOUT_MS);

  it('keeps every comment in the raw source', () => {
    const raw = rawOf(self);
    expect(raw).toContain(LINE_MARKER);
    expect(raw).toContain(BLOCK_MARKER);
  }, SWEEP_TIMEOUT_MS);

  it('reads each file once', () => {
    expect(codeOf(self)).toBe(codeOf(self));
    expect(rawOf(self)).toBe(rawOf(self));
  }, SWEEP_TIMEOUT_MS);
});

describe('relativeToSrc and srcPath', () => {
  it('are inverses, and speak in forward slashes whatever the platform', () => {
    expect(relativeToSrc(srcPath('features/athlete/uuid-v5.ts'))).toBe('features/athlete/uuid-v5.ts');
    expect(relativeToSrc(srcPath('test/source-sweep.ts'))).not.toContain('\\');
  }, SWEEP_TIMEOUT_MS);
});

describe('filesMatching', () => {
  it('lists every matching file by its src/-relative path, sorted', () => {
    const hits = filesMatching(/PERSONA_NAMESPACE/);
    expect(hits).toContain('features/athlete/synthetic-history.ts');
    expect(hits).toEqual([...hits].sort());
  }, SWEEP_TIMEOUT_MS);

  it('excludes the calling guard, so a test may name what it forbids', () => {
    // The whole phrase sweepSelfExclusionMarker lives in this comment, in this
    // file, and nowhere else in src/.
    const marker = new RegExp('sweepSelf' + 'ExclusionMarker');
    expect(filesMatchingRaw(marker)).toEqual(['test/source-sweep.test.ts']);
    expect(filesMatchingRaw(marker, { self: import.meta.url })).toEqual([]);
  }, SWEEP_TIMEOUT_MS);

  it('matches code only, so prose explaining a rule is not a violation of it', () => {
    // The whole phrase sweepCommentOnlyMarker appears in this comment alone.
    const marker = new RegExp('sweepCommentOnly' + 'Marker');
    expect(filesMatching(marker)).toEqual([]);
    expect(filesMatchingRaw(marker)).toEqual(['test/source-sweep.test.ts']);
  }, SWEEP_TIMEOUT_MS);

  it('can leave tests out, for a guard about production callers', () => {
    expect(filesMatching(/relativeToSrc/, { includeTests: false })).toEqual(['test/source-sweep.ts']);
    expect(filesMatching(/relativeToSrc/)).toContain('test/source-sweep.test.ts');
  }, SWEEP_TIMEOUT_MS);
});
