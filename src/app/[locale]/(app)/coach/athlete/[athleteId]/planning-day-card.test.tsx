import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `training-architecture/28` — the planning-day card, first render. Static
 * markup like `week-draft-review.test.tsx`: what is in the markup, and what
 * is not. The write itself is `dayChoice`'s contract (`planning-day.test.ts`)
 * and the action's own test; here only the states the card can render.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const setWeeklySessionDayAction = vi.fn();
vi.mock('./day-actions', () => ({ setWeeklySessionDayAction }));

const { PlanningDayCard } = await import('./planning-day-card');

const TUE = '2026-09-22'; // a Tuesday
const base = {
  athleteId: 'a1',
  value: 'Wednesday',
  todayKey: TUE,
  athleteName: 'Sarah',
  race: { name: 'Aarhus 70.3', weeksOut: 13, blockName: 'Block 1 of 4' },
  locale: 'en',
};

describe('PlanningDayCard — the day as a fact, with the dates it drives', () => {
  it('renders the headline with the name and day, both next-draft dates, the tiles and the fold', () => {
    const html = renderToStaticMarkup(<PlanningDayCard {...base} />);
    expect(html).toContain('headline(name=Sarah,day=dayWednesday())');
    // The coach sees it Tue 22 Sep, the athlete Wed 23 Sep — from `nextDraftDates`,
    // not copy; the locale decides the order of day and month.
    expect(html).toMatch(/coachDate=[^,]*, Sep 22|coachDate=[^,]*22 Sep/);
    expect(html).toMatch(/athleteDate=[^,]*, Sep 23|athleteDate=[^,]*23 Sep/);
    expect(html.match(/<button\b[^>]*aria-pressed=/g)).toHaveLength(7);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('<details');
    expect(html).toContain('howTitle()');
  });

  it('the expanded steps carry the draft week and the race facts', () => {
    const html = renderToStaticMarkup(<PlanningDayCard {...base} />);
    expect(html).toContain('step1(');
    expect(html).toContain('race=Aarhus 70.3');
    expect(html).toContain('weeks=13');
    expect(html).toContain('block=Block 1 of 4');
    expect(html).not.toContain('step1NoRace(');
  });

  it('with no race, step one uses the no-race variant and still reads', () => {
    const html = renderToStaticMarkup(<PlanningDayCard {...base} race={null} />);
    expect(html).toContain('step1NoRace(');
    expect(html).not.toContain('step1(');
    expect(html).toContain('step2(');
    expect(html).toContain('step4(');
  });

  it('presses nothing when no day is stored, and names Sunday as the effective day', () => {
    const html = renderToStaticMarkup(<PlanningDayCard {...base} value={null} />);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('day=daySunday()');
  });

  it('renders the confirm line only while a day is proposed, and never writes on render', () => {
    expect(renderToStaticMarkup(<PlanningDayCard {...base} />)).not.toContain('data-action="confirm-day"');
    const proposing = renderToStaticMarkup(<PlanningDayCard {...base} initialProposed="Thursday" />);
    expect(proposing).toContain('data-action="confirm-day"');
    expect(proposing).toContain('data-action="cancel-day"');
    expect(proposing).toContain('confirmQuestion(day=dayThursday())');
    expect(setWeeklySessionDayAction).not.toHaveBeenCalled();
  });
});
