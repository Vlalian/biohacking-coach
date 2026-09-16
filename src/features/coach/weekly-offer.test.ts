import { describe, it, expect } from 'vitest';
import { effectiveWeeklySessionDay, localWeekday, shouldOfferWeeklySession } from './weekly-offer';

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

  // The "still offers for a drafted week" regression is pinned in
  // `(app)/layout.test.tsx`: this function takes no plan input, so a test here
  // could never fail it (review of 07, 2026-09-15).

  it('reads a stored Flexible as Sunday — the day is retired, not the nudge', () => {
    // "Flexible" was a declared absence of a rhythm. Since 2026-09-14 the
    // proposed week has to arrive on some day, so the stored value reads as
    // Sunday until the athlete (or their Head Coach) picks one (CONTEXT.md).
    expect(
      shouldOfferWeeklySession({ ...base, weeklySessionDay: 'Flexible', todayWeekday: 'Sunday' }),
    ).toBe(true);
    expect(
      shouldOfferWeeklySession({ ...base, weeklySessionDay: 'Flexible', todayWeekday: 'Monday' }),
    ).toBe(false);
  });

  it('reads no stored day as Sunday too', () => {
    expect(shouldOfferWeeklySession({ ...base, weeklySessionDay: null, todayWeekday: 'Sunday' })).toBe(true);
    expect(shouldOfferWeeklySession({ ...base, weeklySessionDay: undefined, todayWeekday: 'Monday' })).toBe(false);
  });
});

describe('effectiveWeeklySessionDay', () => {
  it('passes a weekday through and maps Flexible, unset and garbage to Sunday', () => {
    expect(effectiveWeeklySessionDay('Wednesday')).toBe('Wednesday');
    expect(effectiveWeeklySessionDay('Flexible')).toBe('Sunday');
    expect(effectiveWeeklySessionDay(null)).toBe('Sunday');
    expect(effectiveWeeklySessionDay(undefined)).toBe('Sunday');
    expect(effectiveWeeklySessionDay('Someday')).toBe('Sunday');
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
