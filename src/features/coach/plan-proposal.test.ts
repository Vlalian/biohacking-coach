import { describe, it, expect } from 'vitest';
import { latestPlanWrittenAt, pendingProposal, PLAN_EVENT, type PlanEvent } from './plan-proposal';
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

describe('latestPlanWrittenAt — when the current week was planned (slice 09)', () => {
  const written = (createdAt: string, dates: string[]): PlanEvent => ({
    type: PLAN_EVENT.written,
    createdAt: new Date(createdAt),
    payload: {
      conversationId: 'c1',
      sessions: dates.map((date) => ({ date, type: 'Run', durationMinutes: 45, zone: 'Z2', note: '' })),
    },
  });

  it('returns the newest written event whose sessions fall in the week', () => {
    const older = written('2026-09-06T10:00:00Z', ['2026-09-08', '2026-09-10']);
    const newer = written('2026-09-07T08:00:00Z', ['2026-09-09']);
    const nextWeek = written('2026-09-08T08:00:00Z', ['2026-09-15']);
    expect(latestPlanWrittenAt([older, newer, nextWeek], '2026-09-07')).toEqual(
      new Date('2026-09-07T08:00:00Z'),
    );
  });

  it('newest wins whatever order the rows arrive in', () => {
    const newer = written('2026-09-07T08:00:00Z', ['2026-09-09']);
    const older = written('2026-09-06T10:00:00Z', ['2026-09-08']);
    expect(latestPlanWrittenAt([newer, older], '2026-09-07')).toEqual(new Date('2026-09-07T08:00:00Z'));
  });

  it('counts a write that touches the week with any of its sessions, not all of them', () => {
    const straddling = written('2026-09-07T08:00:00Z', ['2026-09-06', '2026-09-08']);
    expect(latestPlanWrittenAt([straddling], '2026-09-07')).toEqual(new Date('2026-09-07T08:00:00Z'));
  });

  it('skips a malformed session entry inside an otherwise valid payload', () => {
    const at = new Date('2026-09-07T08:00:00Z');
    const event: PlanEvent = {
      type: PLAN_EVENT.written,
      createdAt: at,
      payload: { conversationId: 'c1', sessions: [null, 'x', { note: 'no date' }, { date: '2026-09-09' }] },
    };
    expect(latestPlanWrittenAt([event], '2026-09-07')).toEqual(at);
    const onlyBad: PlanEvent = { ...event, payload: { conversationId: 'c1', sessions: [null] } };
    expect(latestPlanWrittenAt([onlyBad], '2026-09-07')).toBeNull();
  });

  it('skips a written event whose payload is malformed rather than throwing', () => {
    const at = new Date('2026-09-07T08:00:00Z');
    const malformed: unknown[] = [
      null,
      'not an object',
      { nope: true },
      { conversationId: 42, sessions: [{ date: '2026-09-09' }] },
      { conversationId: 'c1', sessions: 'not a list' },
    ];
    for (const payload of malformed) {
      const broken: PlanEvent = { type: PLAN_EVENT.written, createdAt: at, payload };
      expect(latestPlanWrittenAt([broken], '2026-09-07')).toBeNull();
    }
  });

  it('ignores proposals and declines — only a write means a plan exists', () => {
    const proposed: PlanEvent = { ...written('2026-09-07T08:00:00Z', ['2026-09-09']), type: PLAN_EVENT.proposed };
    expect(latestPlanWrittenAt([proposed], '2026-09-07')).toBeNull();
  });

  it('is null when nothing has been written for that week', () => {
    expect(latestPlanWrittenAt([written('2026-09-01T08:00:00Z', ['2026-09-02'])], '2026-09-07')).toBeNull();
    expect(latestPlanWrittenAt([], '2026-09-07')).toBeNull();
  });
});
