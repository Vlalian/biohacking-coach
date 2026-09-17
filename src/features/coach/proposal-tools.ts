import { LOOKUP_TOOL_NAME } from '@/features/knowledge-oracle/lookup-tool';
import type { CoachTool, CoachToolCall } from './coach-client';
import type { Grounding } from './grounding';
import { PROPOSE_WEEK_PLAN_TOOL } from './weekly-session';

/**
 * The tools a conversation offers the Coach when it may propose a week: the
 * plan proposal and the lookup (`knowledge-oracle/05`), with the one resolver
 * that answers both.
 *
 * Lifted out of the Weekly Session's service when Coach Chat gained the
 * proposal (`training-architecture/20`), so the two surfaces offer the same
 * tools with the same words rather than two copies that drift. One resolver
 * because the adapter makes exactly one tool round-trip and a turn may carry
 * both calls: the lookup goes to the grounding, everything else gets the
 * proposal acknowledgement.
 */

/**
 * What the Coach is told after it proposes a plan: the plan is not saved, the
 * athlete decides. This keeps the Coach from claiming the week is done.
 */
export const PROPOSAL_ACK =
  'The plan has been shown to the athlete to confirm or cancel. Acknowledge briefly and ' +
  'invite them to confirm when ready. Do not say it has been saved.';

export function proposalTurnTools(grounding: Grounding): {
  tools: readonly CoachTool[];
  resolveTool: (call: CoachToolCall) => Promise<string>;
} {
  return {
    tools: [PROPOSE_WEEK_PLAN_TOOL, grounding.tool],
    resolveTool: (call) =>
      call.name === LOOKUP_TOOL_NAME ? grounding.resolve(call) : Promise.resolve(PROPOSAL_ACK),
  };
}
