import { describe, it, expect } from 'vitest';
import { buildInterviewPrompt } from './feedback-prompt';

/**
 * The golden interviewer prompt — the same net `coach/prompts.golden.test.ts`
 * puts under the Coach's prompts, for the same reason and with more need.
 *
 * `feedback-prompt.test.ts` asserts the rules that matter: it says it is not the
 * Coach, it refuses to defend, it pushes for the specific artifact. Those are
 * structural, and they leave every *other* line of the prompt unasserted — which
 * is how a prompt loses a paragraph without a single test going red. The ticket
 * named that exact risk ("it is prose, and prose passes tests"), and mutation
 * testing confirmed it: nine string literals in this prompt could be emptied
 * with the suite still green.
 *
 * So this file pins the whole rendered string, in both states the service can
 * put it in. It is deliberately blunt.
 *
 * When the interviewer is *deliberately* reworded, update these (`vitest -u`)
 * and read the diff as the review artifact — it is the whole of what the
 * interviewer will now say, and whether it still sounds like an interviewer
 * rather than a second Coach is the one thing no test here can tell you.
 */

describe('the interviewer prompt, rendered', () => {
  it('is unchanged before the Trust Signal is due', () => {
    expect(buildInterviewPrompt({ askTrustSignal: false })).toMatchSnapshot();
  });

  it('is unchanged on the turn that carries the Trust Signal', () => {
    expect(buildInterviewPrompt({ askTrustSignal: true })).toMatchSnapshot();
  });

  it('is unchanged for a Danish tester', () => {
    // The language directive splices into the first sentence, before the prompt
    // names what this conversation is — same place it sits in every Coach prompt.
    expect(
      buildInterviewPrompt({ askTrustSignal: false, language: 'Dansk' }),
    ).toMatchSnapshot();
  });
});
