// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { disclosureCopy } from '@/features/consent/disclosure';

/**
 * `training-architecture/14`: declaring an Injury or Illness asks for the
 * `injury_health_data` consent at the moment it matters. The action refuses
 * with `consent-required`; the drawer shows what the consent covers, and
 * agreeing grants it and declares again — refusing to write rather than writing
 * and asking after.
 */
const { declareInjuryAction, declareIllnessAction, grantConsentsAction, refresh } = vi.hoisted(() => ({
  declareInjuryAction: vi.fn(),
  declareIllnessAction: vi.fn(),
  grantConsentsAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/use-dialog-focus', () => ({ useDialogFocus: () => ({ current: null }) }));
vi.mock('./health-actions', () => ({
  declareInjuryAction,
  declareIllnessAction,
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
vi.mock('./consent-actions', () => ({ grantConsentsAction }));

/**
 * Generous under a loaded full-suite run, where rendering the whole drawer in
 * happy-dom takes seconds; each wait still ends as soon as it holds.
 */
const SLOW = { timeout: 10_000 };
vi.setConfig({ testTimeout: 30_000 });

const { HealthDrawer } = await import('./health-drawer');

const COPY = disclosureCopy('en').purposes.injury_health_data;

beforeEach(() => {
  declareInjuryAction.mockReset();
  declareIllnessAction.mockReset();
  grantConsentsAction.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});
afterEach(cleanup);

/** The agree button once it can be pressed: it appears while the first declaration's transition is still settling. */
async function agreeButton(): Promise<HTMLButtonElement> {
  const button = (await screen.findByRole('button', { name: 'consentAgreeAndDeclare' }, SLOW)) as HTMLButtonElement;
  await vi.waitFor(() => expect(button.disabled).toBe(false), SLOW);
  return button;
}

/** Opens the drawer and marks one discipline as impossible, which is what enables "declare an injury". */
function openDrawer() {
  render(<HealthDrawer state={{ open: true }} spans={[]} locale="en" onClose={() => {}} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'allowNone' })[0]);
}

describe('HealthDrawer — the injury consent', () => {
  it('shows what the consent covers when a declaration needs it, and writes nothing yet', async () => {
    declareInjuryAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'declareInjury' }));

    expect(await screen.findByText(COPY.title, {}, SLOW)).toBeTruthy();
    expect(screen.getByText(COPY.body)).toBeTruthy();
    expect(grantConsentsAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('agreeing grants the consent, then declares the same injury again', async () => {
    declareInjuryAction
      .mockResolvedValueOnce({ ok: false, reason: 'consent-required' })
      .mockResolvedValueOnce({ ok: true });
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'declareInjury' }));
    fireEvent.click(await agreeButton());

    await vi.waitFor(() => expect(declareInjuryAction).toHaveBeenCalledTimes(2), SLOW);
    expect(grantConsentsAction).toHaveBeenCalledWith(['injury_health_data']);
    expect(grantConsentsAction.mock.invocationCallOrder[0]).toBeLessThan(declareInjuryAction.mock.invocationCallOrder[1]);
    expect(declareInjuryAction.mock.calls[1]).toEqual(declareInjuryAction.mock.calls[0]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce(), SLOW);
    expect(screen.queryByText(COPY.title)).toBeNull();
  });

  it('declares nothing when granting fails, and says so', async () => {
    declareInjuryAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    grantConsentsAction.mockResolvedValue({ ok: false, reason: 'not-authenticated' });
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'declareInjury' }));
    fireEvent.click(await agreeButton());

    expect(await screen.findByRole('alert', {}, SLOW)).toBeTruthy();
    expect(declareInjuryAction).toHaveBeenCalledOnce();
  });
});
