// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

/**
 * `showable-version/51`: a day's health mark is a button that opens the drawer
 * on its own record — a past one included, for the athlete and the coach. The
 * drawer is mocked and records the state it was opened with.
 */
const { drawerProps } = vi.hoisted(() => ({ drawerProps: [] as Array<{ state: unknown }> }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'date' }),
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./move-actions', () => ({ moveSessionAction: vi.fn() }));
vi.mock('./availability-actions', () => ({ markUnavailableDateAction: vi.fn(), clearUnavailableDateAction: vi.fn() }));
vi.mock('./rating-modal', () => ({ RatingModal: () => null }));
vi.mock('./session-drawer', () => ({ SessionDrawer: () => null }));
vi.mock('./redraft-card', () => ({ RedraftCard: () => null }));
vi.mock('./drafting-card', () => ({ DraftingCard: () => null }));
vi.mock('./proposal-card', () => ({ ProposalCard: () => null }));
vi.mock('./health-drawer', () => ({
  HealthDrawer: (props: { state: unknown }) => {
    drawerProps.push(props);
    return null;
  },
}));

const { Calendar } = await import('./calendar');

const OLD_KNEE = {
  kind: 'injury' as const, id: 'inj_old', from: '2026-08-03', to: '2026-08-06',
  capacity: { swim: 'full' as const, bike: 'full' as const, run: 'none' as const }, bother: null,
  name: 'left knee', openedAt: new Date('2026-08-03T08:00:00Z'),
};

afterEach(() => {
  cleanup();
  drawerProps.length = 0;
});

describe('pressing a health mark', () => {
  it('opens the drawer on the pressed record, past ones included, for the athlete and the coach', () => {
    for (const coachAthleteId of [undefined, 'athlete_1']) {
      const { container } = render(
        <Calendar sessions={[]} unavailableDates={[]} todayKey="2026-08-19" health={[OLD_KNEE]} coachAthleteId={coachAthleteId} />,
      );
      fireEvent.click(container.querySelector('[data-day="2026-08-04"] [data-mark="injury"]')!);
      expect(drawerProps.at(-1)?.state).toEqual({ open: true, kind: 'injury', id: 'inj_old' });
      cleanup();
      drawerProps.length = 0;
    }
  });
});
