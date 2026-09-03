import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildInterviewPrompt, TRUST_SIGNAL_QUESTION } from './feedback-prompt';

/**
 * The interviewer prompt is prose, and prose passes tests. What is asserted here
 * is only what is *structural* — the facts `showable-version/07` and CONTEXT.md
 * commit to, which a later edit could undo without noticing. Whether it actually
 * sounds like an interviewer is Mads's to read; no test will tell him.
 */

describe('buildInterviewPrompt', () => {
  const prompt = buildInterviewPrompt({ askTrustSignal: false });

  it('says it is not the Coach', () => {
    // The single load-bearing sentence. The tester has to know who they are
    // talking to before they will say the Coach got it wrong.
    expect(prompt).toMatch(/not the Coach/i);
  });

  it('never calls itself Coach', () => {
    // `openingBlock` in the Coach's own prompt-blocks opens every Coach prompt
    // with "You are Coach in a luxury Ironman training app". Reusing it here
    // would make the interviewer a second Coach in one line.
    expect(prompt).not.toMatch(/You are Coach/);
  });

  it('sends a coaching question back to the Coach thread', () => {
    expect(prompt).toMatch(/coaching question/i);
    expect(prompt).toMatch(/Coach Chat|Coach thread/i);
  });

  it('forbids the postures an interviewer must not have', () => {
    // Peer Authority is a *defending* posture (CONTEXT.md) and it is exactly
    // wrong for whoever collects a complaint.
    expect(prompt).toMatch(/never defend/i);
    expect(prompt).toMatch(/no training advice|never give training advice/i);
  });

  it('pushes for the specific artifact rather than a general impression', () => {
    // The whole reason this is an interview and not a box: a box returns "the
    // Coach felt off sometimes", and an interview can ask which one.
    expect(prompt).toMatch(/which session/i);
    expect(prompt).toMatch(/which message/i);
  });

  it('does not chase a quota of questions', () => {
    expect(prompt).toMatch(/stops when|stop when|do not chase|never chase/i);
  });

  it('leaves the Trust Signal out until it is due', () => {
    expect(prompt).not.toContain(TRUST_SIGNAL_QUESTION);
  });

  it('carries the Trust Signal verbatim when it is due', () => {
    // CONTEXT.md calls it the single most valuable qualitative data point and
    // gives its exact wording. A paraphrase measures something else.
    const due = buildInterviewPrompt({ askTrustSignal: true });

    expect(due).toContain(TRUST_SIGNAL_QUESTION);
  });

  it('answers in the tester’s language', () => {
    const danish = buildInterviewPrompt({ askTrustSignal: false, language: 'Dansk' });

    expect(danish).toMatch(/Respond in Danish/);
  });
});

describe('the interviewer is structurally not the Coach', () => {
  it('imports nothing from the Coach’s prompt builders', () => {
    // The ticket asks this to "fail loudly if someone later wires the kinds
    // together generically". A test on the rendered string cannot catch a
    // shared import that only changes the prompt under some conditions — this
    // reads the source and refuses the coupling itself.
    //
    // Import lines only, deliberately: the module comment names `openingBlock`
    // to explain why it is not used, and a prose mention is not a coupling.
    for (const file of ['feedback-prompt.ts', 'feedback-service.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      // Whole statements, not first lines: these modules import in the braced
      // multi-line form, where the module path is on the closing line.
      const imports = [...source.matchAll(/import[\s\S]*?from '[^']+';/g)]
        .map(([statement]) => statement)
        .join('\n');

      expect(imports, file).not.toMatch(/coach\/prompts/);
      expect(imports, file).not.toMatch(/openingBlock/);
      expect(imports, file).not.toMatch(/buildChatPrompt|renderWeeklyPrompt/);
    }
  });
});
