// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

/**
 * `showable-version/51`: a day's health mark is a button that opens the drawer
 * on its own record, a past one included, for the athlete and the coach. The
 * real drawer renders; only the server actions behind it are mocked.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'date' }),
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/use-dialog-focus', () => ({ useDialogFocus: () => ({ current: null }) }));
vi.mock('./move-actions', () => ({ moveSessionAction: vi.fn() }));
vi.mock('./availability-actions', () => ({ markUnavailableDateAction: vi.fn(), clearUnavailableDateAction: vi.fn() }));
vi.mock('./consent-actions', () => ({ grantConsentsAction: vi.fn() }));
vi.mock('./health-actions', () => ({
  declareInjuryAction: vi.fn(),
  declareIllnessAction: vi.fn(),
  closeInjuryAction: vi.fn(),
  closeIllnessAction: vi.fn(),
  deleteInjuryAction: vi.fn(),
  deleteIllnessAction: vi.fn(),
  addHealthNoteAction: vi.fn(),
  setBotherAction: vi.fn(),
  readHealthNotesAction: vi.fn(async () => ({ ok: true, notes: [] })),
}));
vi.mock('./(app)/coach/athlete/[athleteId]/health-actions', () => ({
  addHealthNoteAsCoachAction: vi.fn(),
  readHealthNotesAsCoachAction: vi.fn(async () => ({ ok: true, notes: [] })),
}));
vi.mock('./rating-modal', () => ({ RatingModal: () => null }));
vi.mock('./session-drawer', () => ({ SessionDrawer: () => null }));
vi.mock('./redraft-card', () => ({ RedraftCard: () => null }));
vi.mock('./drafting-card', () => ({ DraftingCard: () => null }));
vi.mock('./proposal-card', () => ({ ProposalCard: () => null }));

const { Calendar } = await import('./calendar');

const OLD_KNEE = {
  kind: 'injury' as const, id: 'inj_old', from: '2026-08-03', to: '2026-08-06',
  capacity: { swim: 'full' as const, bike: 'full' as const, run: 'none' as const }, bother: null,
  name: 'left knee', openedAt: new Date('2026-08-03T08:00:00Z'),
};
const NEW_CALF = {
  ...OLD_KNEE, id: 'inj_new', from: '2026-08-15', to: null, name: 'right calf',
  openedAt: new Date('2026-08-15T08:00:00Z'),
};

afterEach(cleanup);

describe('pressing a health mark', () => {
  it('opens the drawer on the pressed record, past ones included, for the athlete and the coach', () => {
    for (const coachAthleteId of [undefined, 'athlete_1']) {
      const { container } = render(
        <Calendar sessions={[]} unavailableDates={[]} todayKey="2026-08-19" health={[OLD_KNEE, NEW_CALF]} coachAthleteId={coachAthleteId} />,
      );
      expect(container.querySelector('[data-selected]')).toBeNull();
      fireEvent.click(container.querySelector('[data-day="2026-08-04"] [data-mark="injury"]')!);
      expect(container.querySelector('[data-selected="inj_old"]')).not.toBeNull();
      cleanup();
    }
  });
});
