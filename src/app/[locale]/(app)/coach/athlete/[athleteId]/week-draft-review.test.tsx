import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `training-architecture/17` — the Head Coach's two new surfaces on the plan
 * tab, first render. `renderToStaticMarkup` like `block-panel.test.tsx`: what
 * is asserted is what is in the markup, and what is not.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The server actions' import chains reach auth and the database; a first
// render never calls them.
vi.mock('./week-draft-actions', () => ({ approveWeekDraftAction: vi.fn() }));
vi.mock('./day-actions', () => ({ setWeeklySessionDayAction: vi.fn() }));

const { WeekDraftReview } = await import('./week-draft-review');
const { WeeklyDayField } = await import('./weekly-day-field');

const DRAFT = {
  id: 'd1',
  weekStart: '2026-09-21',
  visibleFrom: '2026-09-17',
  sessions: [
    { date: '2026-09-22', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: 'easy spin' },
    { date: '2026-09-24', type: 'Intensity' as const, durationMinutes: 45, zone: null, note: null },
    { date: '2026-09-27', type: 'Endurance' as const, durationMinutes: 150, zone: 'Z2', note: 'long ride' },
  ],
  citations: [],
  approved: false,
  createdAt: new Date('2026-09-16T06:00:00Z'),
};

describe('WeekDraftReview', () => {
  const html = renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={DRAFT} />);

  it('renders one row per proposed session with the day fixed and type, minutes, zone and note editable', () => {
    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html).toContain('2026-09-22');
    expect(html).toContain('2026-09-27');
    expect(html.match(/<select\b/g)).toHaveLength(3);
    expect(html.match(/<input type="number"/g)).toHaveLength(3);
    expect(html).toContain('value="easy spin"');
    // The day is text, never an input: it comes from the skeleton.
    expect(html).not.toMatch(/<input[^>]*type="date"/);
  });

  it('carries the draft id and offers exactly one action — approve', () => {
    expect(html).toContain('data-draft-id="d1"');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('approve()');
    expect(html).toContain('lead(week=2026-09-21)');
    expect(html).not.toMatch(/decline|reject|delete/i);
  });

  it('renders nothing when there is no draft, and nothing once the draft is the approved version', () => {
    expect(renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={null} />)).toBe('');
    expect(renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={{ ...DRAFT, approved: true }} />)).toBe('');
  });
});

describe('WeeklyDayField — the coach’s control over the athlete’s day', () => {
  it('offers the seven weekdays and nothing else, with the stored day pressed', () => {
    const html = renderToStaticMarkup(<WeeklyDayField athleteId="a1" value="Wednesday" />);
    expect(html.match(/<button\b/g)).toHaveLength(7);
    expect(html).not.toMatch(/Flexible|optFlexible/);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('dayWednesday()');
    expect(html).toContain('label()');
  });

  it('presses nothing when no day is stored', () => {
    const html = renderToStaticMarkup(<WeeklyDayField athleteId="a1" value={null} />);
    expect(html).not.toContain('aria-pressed="true"');
  });
});
