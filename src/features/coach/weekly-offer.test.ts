import { describe, it, expect } from 'vitest';
import { effectiveWeeklySessionDay, localWeekday, shouldOfferCheckIn } from './weekly-offer';

describe('shouldOfferCheckIn', () => {
  const base = {
    weeklySessionDay: 'Monday',
    todayWeekday: 'Monday',
    hasCheckedInThisWeek: false,
  };

  it('asks on the Weekly Session Day when no Check-in is filed for the week', () => {
    expect(shouldOfferCheckIn(base)).toBe(true);
  });

  it('stays silent on any other day', () => {
    expect(shouldOfferCheckIn({ ...base, todayWeekday: 'Wednesday' })).toBe(false);
  });

  it('stays silent once this week’s Check-in is filed', () => {
    // The reminder asks for a report, not for the same report twice.
    expect(shouldOfferCheckIn({ ...base, hasCheckedInThisWeek: true })).toBe(false);
  });

  // The "still asks for a drafted week" regression is pinned in
  // `(app)/layout.test.tsx`: this function takes no plan input, so a test here
  // could never fail it (review of 07, 2026-09-15).

  it('reads a stored Flexible as Sunday — the day is retired, not the nudge', () => {
    // "Flexible" was a declared absence of a rhythm. Since 2026-09-14 the
    // proposed week has to arrive on some day, so the stored value reads as
    // Sunday until the athlete (or their Head Coach) picks one (CONTEXT.md).
    expect(
      shouldOfferCheckIn({ ...base, weeklySessionDay: 'Flexible', todayWeekday: 'Sunday' }),
    ).toBe(true);
    expect(
      shouldOfferCheckIn({ ...base, weeklySessionDay: 'Flexible', todayWeekday: 'Monday' }),
    ).toBe(false);
  });

  it('reads no stored day as Sunday too', () => {
    expect(shouldOfferCheckIn({ ...base, weeklySessionDay: null, todayWeekday: 'Sunday' })).toBe(true);
    expect(shouldOfferCheckIn({ ...base, weeklySessionDay: undefined, todayWeekday: 'Monday' })).toBe(false);
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
