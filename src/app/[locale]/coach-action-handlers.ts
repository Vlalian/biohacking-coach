import type { CoachAction } from '@/features/coach/coach-actions';

/** What the client can do on an action's behalf; supplied by the shell. */
export interface CoachActionContext {
  openView: (view: string) => void;
}

type Handler = (payload: Record<string, unknown>, ctx: CoachActionContext) => void;

/**
 * The client half of the Coach Actions catalog (`coach-actions/02`): one handler
 * per action name. Adding an action is one catalog entry plus one entry here.
 */
const COACH_ACTION_HANDLERS: Readonly<Record<string, Handler>> = {
  open_view: (payload, ctx) => {
    if (typeof payload.view === 'string') ctx.openView(payload.view);
  },
};

/**
 * Runs each ephemeral action through the handler registered under its name;
 * skips any with none. Durable actions are proposed, never performed (ADR 0008),
 * so they are not run here whatever handlers exist.
 */
export function performCoachActions(actions: readonly CoachAction[], ctx: CoachActionContext): void {
  for (const action of actions) {
    if (action.durability !== 'ephemeral') continue;
    COACH_ACTION_HANDLERS[action.name]?.(action.payload, ctx);
  }
}
