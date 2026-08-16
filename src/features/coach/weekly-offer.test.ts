import { describe, it, expect } from 'vitest';
import { localWeekday, shouldOfferWeeklySession } from './weekly-offer';

describe('shouldOfferWeeklySession', () => {
  const base = {
    weeklySessionDay: 'Monday',
    todayWeekday: 'Monday',
    hasHeldWeeklySessionThisWeek: false,
  };

  it('offers on the preferred day when no Weekly Session has been held', () => {
    expect(shouldOfferWeeklySession(base)).toBe(true);
  });

  it('stays silent on any other day', () => {
    expect(shouldOfferWeeklySession({ ...base, todayWeekday: 'Wednesday' })).toBe(false);
  });

  it('stays silent once the athlete has held this week’s session', () => {
    // The nudge is an offer to talk, not a reminder to talk again.
    expect(shouldOfferWeeklySession({ ...base, hasHeldWeeklySessionThisWeek: true })).toBe(false);
  });

  it('still offers when a plan exists but no session was held', () => {
    // The gate keys on the conversation, not the plan — otherwise automatic
    // generation would silence its own offer (coach-overlay issue 04,
    // decision 4). A drafted week is exactly the week worth discussing.
    expect(shouldOfferWeeklySession({ ...base, hasHeldWeeklySessionThisWeek: false })).toBe(true);
  });

  it('never nudges an athlete who chose Flexible', () => {
    // "Flexible" is a declared absence of a rhythm — ADR 0007 allows exactly one
    // sanctioned nudge, and an athlete who named no day is not asking for it.
    expect(
      shouldOfferWeeklySession({ ...base, weeklySessionDay: 'Flexible', todayWeekday: 'Flexible' }),
    ).toBe(false);
  });

  it('never nudges when no day is stored at all', () => {
    expect(shouldOfferWeeklySession({ ...base, weeklySessionDay: null })).toBe(false);
    expect(shouldOfferWeeklySession({ ...base, weeklySessionDay: undefined })).toBe(false);
  });
});

describe('localWeekday', () => {
  it('names the day in the en-US vocabulary the Athlete Profile stores', () => {
    // Weekly Session Day is stored as 'Monday', not a localized name, so the
    // comparison has to speak the same language whatever the athlete's UI is in.
    expect(localWeekday(new Date('2026-08-17T12:00:00'))).toBe('Monday');
  });

  it('reads the local clock, which is the whole point of resolving it client-side', () => {
    // Late on a Sunday evening in a UTC+ zone, the UTC date has already rolled
    // over to Monday. The athlete is still in Sunday, and the nudge must agree
    // with them — no timezone is stored on the profile, so only the browser can
    // answer this. Constructed without a Z suffix so it is a *local* instant.
    const sundayLateEvening = new Date('2026-08-16T23:30:00');
    expect(localWeekday(sundayLateEvening)).toBe('Sunday');
  });
});
