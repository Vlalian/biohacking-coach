import { describe, it, expect } from 'vitest';
import { pendingProposal, PLAN_EVENT, type PlanEvent } from './plan-proposal';
import type { ProposedSession } from './weekly-session';

const SESSIONS: ProposedSession[] = [
  { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
];

function ev(type: string, conversationId: string, order: number): PlanEvent {
  return {
    type,
    payload: { conversationId, sessions: SESSIONS },
    createdAt: new Date(2026, 6, 29, 0, order),
  };
}

describe('pendingProposal', () => {
  it('returns the proposal when nothing has resolved it', () => {
    const result = pendingProposal([ev(PLAN_EVENT.proposed, 'c1', 0)], 'c1');
    expect(result).toEqual({ conversationId: 'c1', sessions: SESSIONS });
  });

  it('is null once the proposal was written', () => {
    const events = [ev(PLAN_EVENT.proposed, 'c1', 0), ev(PLAN_EVENT.written, 'c1', 1)];
    expect(pendingProposal(events, 'c1')).toBeNull();
  });

  it('is null once the proposal was declined', () => {
    const events = [ev(PLAN_EVENT.proposed, 'c1', 0), ev(PLAN_EVENT.declined, 'c1', 1)];
    expect(pendingProposal(events, 'c1')).toBeNull();
  });

  it('surfaces a re-proposal made after a decline', () => {
    const events = [
      ev(PLAN_EVENT.proposed, 'c1', 0),
      ev(PLAN_EVENT.declined, 'c1', 1),
      ev(PLAN_EVENT.proposed, 'c1', 2),
    ];
    expect(pendingProposal(events, 'c1')).toEqual({ conversationId: 'c1', sessions: SESSIONS });
  });

  it("ignores another conversation's decision", () => {
    const events = [
      ev(PLAN_EVENT.proposed, 'c1', 0),
      ev(PLAN_EVENT.declined, 'c2', 1), // a different conversation resolves nothing here
    ];
    expect(pendingProposal(events, 'c1')).toEqual({ conversationId: 'c1', sessions: SESSIONS });
  });

  it('ignores a malformed payload', () => {
    const bad: PlanEvent = { type: PLAN_EVENT.proposed, payload: null, createdAt: new Date() };
    expect(pendingProposal([bad], 'c1')).toBeNull();
  });
});
