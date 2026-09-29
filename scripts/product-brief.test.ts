import { describe, it, expect } from 'vitest';
import {
  condenseBrief,
  missingTerms,
  personalPlannedLines,
  personalTerms,
  plannedFeaturesFrom,
  renderGeneratedModule,
} from './product-brief.mjs';

/**
 * `showable-version/58` — the Feedback Interview is told what the app is.
 *
 * The code cannot read the private docs repo at runtime, so a script condenses
 * `CONTEXT-BRIEF.md` and the hand-kept planned-features list into a checked-in
 * module. What it keeps, and what it refuses to carry, is decided here.
 */

// Shaped like the real CONTEXT-BRIEF.md: an orientation table about the docs,
// then `- **Term** — definition` lines under `###` sections. Personal data is
// planted where a careless condenser would carry it through.
const FIXTURE_CONTEXT_BRIEF = [
  '# Context brief',
  '',
  '| Surface | What it holds |',
  '|---|---|',
  '| MAP.md | START HERE. Ask madskilstrup@gmail.com or call +45 12 34 56 78. |',
  '',
  '## Glossary index',
  '',
  '### Training Plan',
  '',
  "- **Training Plan** — the Coach's rolling view of the athlete's upcoming training, presented as a monthly calendar grid.",
  '- **Planned Session** — a session recommended by the Coach for a future day (decided 2026-09-02), as part of the Week Plan.',
  '- **Coach Overlay** — the always-available surface for the one Coach conversation (`docs/adr/0007`, 2026-08-03).',
  '- **Head Coach** — the human coach overseeing a Roster; write to madskilstrup@gmail.com.',
  '- **Injury** — a part of the body that has stopped some training; Thomas can be reached on +45 12 34 56 78.',
  '- **Onboarding Session** — the structured first meeting between Coach and athlete, delivered as a **deliberately large, buttoned MCQ inflow** (confirmed 2026-08-03) — this mirrors a real coach intake, not a shortened version of one; content is gr…',
  '- **Knowledge Oracle** — the research agent.',
  // Provenance that opens a definition, with no space before it, and a trailing space.
  '- **Session Type** — *(renamed 2026-09-10)* the category of a Planned Session.   ',
  // Single-star emphasis, which the bold pass does not remove.
  '- **Session Reflection** — the *post-session* ritual.',
  // A glossary-shaped fragment inside prose is not a definition.
  'Older notes also mention - **Race** — an entry in a spreadsheet.',
  '',
].join('\n');

describe('product-brief — condensing CONTEXT-BRIEF.md', () => {
  it('condenses the brief to what the app is, under a size cap, with no email, phone or tester name', () => {
    const out = condenseBrief(FIXTURE_CONTEXT_BRIEF);
    expect(out.length).toBeLessThan(4000);
    expect(out).not.toMatch(/@|\+45|madskilstrup/i);
    expect(out).toMatch(/Training Plan/);
  });

  it('keeps only the chosen product terms, one line each, and not the docs orientation', () => {
    const lines = condenseBrief(FIXTURE_CONTEXT_BRIEF).split('\n');
    expect(lines).toContain(
      "Training Plan: Momentum's rolling view of the athlete's upcoming training, presented as a monthly calendar grid.",
    );
    // Not a product term the interviewer needs.
    expect(lines.some((l) => l.startsWith('Knowledge Oracle'))).toBe(false);
    expect(lines.some((l) => l.includes('START HERE'))).toBe(false);
  });

  it('speaks of Momentum, never "the Coach", which is not what the tester knows it as', () => {
    const out = condenseBrief(FIXTURE_CONTEXT_BRIEF);
    expect(out).not.toMatch(/\bthe Coach\b/);
    expect(out).toContain('Planned Session: a session recommended by Momentum for a future day, as part of the Week Plan.');
    // A named surface keeps its name.
    expect(out).toContain('Coach Overlay: the always-available surface for the one Momentum conversation.');
  });

  it('drops decision dates, ADR paths and markdown emphasis', () => {
    const out = condenseBrief(FIXTURE_CONTEXT_BRIEF);
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}|adr|\*|`/i);
  });

  it('reads a definition that opens on provenance, or has emphasis inside it, as plain text', () => {
    const lines = condenseBrief(FIXTURE_CONTEXT_BRIEF).split('\n');
    expect(lines).toContain('Session Type: the category of a Planned Session.');
    expect(lines).toContain('Session Reflection: the post-session ritual.');
  });

  it('reads only definitions that open a line, not one quoted inside prose', () => {
    expect(missingTerms(FIXTURE_CONTEXT_BRIEF)).toContain('Race');
  });

  it('cuts a capped definition back to its first clause rather than ending mid-word', () => {
    expect(condenseBrief(FIXTURE_CONTEXT_BRIEF)).toContain(
      'Onboarding Session: the structured first meeting between Momentum and athlete, delivered as a deliberately large, buttoned MCQ inflow.',
    );
  });

  it('drops a whole line that carries an email or a phone number', () => {
    const out = condenseBrief(FIXTURE_CONTEXT_BRIEF);
    expect(out).not.toMatch(/^Head Coach/m);
    expect(out).not.toMatch(/^Injury/m);
    expect(out).not.toMatch(/Thomas/);
  });

  it('names the chosen terms it dropped for personal data, by term and never by content', () => {
    const dropped = personalTerms(FIXTURE_CONTEXT_BRIEF);
    expect(dropped).toEqual(['Injury', 'Head Coach']);
    expect(dropped.join(' ')).not.toMatch(/@|\d/);
  });

  it('names the chosen terms the source no longer has, so a rename fails the script', () => {
    const missing = missingTerms(FIXTURE_CONTEXT_BRIEF);
    expect(missing).toContain('Glossary');
    expect(missing).not.toContain('Training Plan');
  });
});

describe('product-brief — the planned-features list', () => {
  it('reads planned features as one short line each', () => {
    expect(plannedFeaturesFrom('- **Races in the calendar**: add races from a day.\n')).toEqual([
      'Races in the calendar: add races from a day.',
    ]);
  });

  it('skips the heading and prose around the list, CRLF or LF', () => {
    const md = '# Planned features\r\n\r\nA short list.\r\n\r\n- **One**: first.\r\n- **Two**: second.\r\nTrailing prose.\r\n';
    expect(plannedFeaturesFrom(md)).toEqual(['One: first.', 'Two: second.']);
  });

  it('reads only items that open a line, and trims what surrounds the text', () => {
    const md = 'Prose that quotes - **Inline**: not an item.\n- **Spaced**:   padded.   \n';
    expect(plannedFeaturesFrom(md)).toEqual(['Spaced: padded.']);
  });

  it('drops a phone number written without a country code, spaced, dashed or run together', () => {
    const md = '- **A**: call 12345678.\n- **B**: call 12 34 56 78.\n- **C**: call 12-34-56-78.\n';
    expect(plannedFeaturesFrom(md)).toEqual([]);
  });

  it('keeps ordinary numbers and a literal plus sign', () => {
    const md = '- **D**: a "+" on any day, 7-day weeks, a 1–10 scale, 20 x 400 m.\n';
    expect(plannedFeaturesFrom(md)).toEqual(['D: a "+" on any day, 7-day weeks, a 1–10 scale, 20 x 400 m.']);
  });

  it('keeps a seven-digit figure, which is one digit short of a phone number', () => {
    const md = '- **E**: a 1 000 000 m season.\n';
    expect(plannedFeaturesFrom(md)).toEqual(['E: a 1 000 000 m season.']);
  });

  it('names the source line of each item it dropped, and nothing of its content', () => {
    const md = '# Planned\n\n- **Kept**: fine.\n- **Invite**: ask mads@example.com.\n- **Call**: ring 12 34 56 78.\n';
    expect(personalPlannedLines(md)).toEqual([4, 5]);
    expect(personalPlannedLines('- **Kept**: fine.\n')).toEqual([]);
  });

  it('drops an item that carries an email or a phone number', () => {
    expect(plannedFeaturesFrom('- **Invite**: ask mads@example.com.\n- **Call**: ring +45 12 34 56 78.\n')).toEqual([]);
  });
});

describe('product-brief — the generated module', () => {
  it('carries the generated-file header with the command that regenerates it', () => {
    const src = renderGeneratedModule('A: one.\nB: two.', ['P: planned.']);
    expect(src.split('\n')[0]).toMatch(/^\/\/ Generated by scripts\/product-brief\.mjs — do not edit\./);
    expect(src).toContain('node scripts/product-brief.mjs <docs-root>');
  });

  it('says where the sources are and what each export holds, in a fixed layout', () => {
    const src = renderGeneratedModule('A: one.', ['P: planned.']);
    expect(src).toBe(
      [
        '// Generated by scripts/product-brief.mjs — do not edit.',
        '// Regenerate from the code repo root with `node scripts/product-brief.mjs <docs-root>`, where',
        '// <docs-root> is the private docs repo. Sources there: CONTEXT-BRIEF.md and',
        '// .scratch/post-testing/planned-features.md.',
        '',
        '/** What the app is, one product term per line, for the Feedback Interview (showable-version/58). */',
        'export const PRODUCT_BRIEF: readonly string[] = [',
        '  "A: one.",',
        '];',
        '',
        '/** Features that are planned, not built. The interviewer never raises these first. */',
        'export const PLANNED_FEATURES: readonly string[] = [',
        '  "P: planned.",',
        '];',
        '',
      ].join('\n'),
    );
  });

  it('exports each brief line and each planned feature as a string literal', () => {
    const src = renderGeneratedModule('A: "quoted".\nB: two.', ['P: planned.']);
    expect(src).toContain('export const PRODUCT_BRIEF: readonly string[] = [\n  "A: \\"quoted\\".",\n  "B: two.",\n];');
    expect(src).toContain('export const PLANNED_FEATURES: readonly string[] = [\n  "P: planned.",\n];');
    expect(src.endsWith('\n')).toBe(true);
  });
});
