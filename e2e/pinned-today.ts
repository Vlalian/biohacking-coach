/**
 * The day the page suite pretends it is.
 *
 * Every picture with a calendar on it carries a date, so without a fixed day
 * the suite is red each morning for no reason. The pin was removed on
 * 2026-09-17 (Mads's ruling, `b3ac800`) because the calendar's highlighted
 * cell froze while the seeded sessions kept moving with the real clock — the
 * two halves of one picture disagreeing. frontend-quality/09 put the seed on
 * the app's clock, so both halves now freeze together, and the pin is back
 * (Mads, 2026-09-22). The dev server and the seed must both read it.
 */
export const PINNED_TODAY = '2026-09-10';
