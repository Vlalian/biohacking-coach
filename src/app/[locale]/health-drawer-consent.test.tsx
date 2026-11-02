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

/**
 * Opens the drawer, opens "Report an injury", names it "left calf" and marks
 * swimming impossible (what enables Save), then saves (showable-version/50).
 */
function openDrawer() {
  render(<HealthDrawer state={{ open: true }} spans={[]} locale="en" onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /reportInjury/ }));
  fireEvent.change(document.querySelector('[data-field="name"]')!, { target: { value: 'left calf' } });
  fireEvent.click(screen.getAllByRole('radio', { name: 'allowNone' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'saveInjury' }));
}

describe('HealthDrawer — the injury consent', () => {
  it('shows what the consent covers when a declaration needs it, and writes nothing yet', async () => {
    declareInjuryAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    openDrawer();


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

    fireEvent.click(await agreeButton());

    expect(await screen.findByRole('alert', {}, SLOW)).toBeTruthy();
    expect(declareInjuryAction).toHaveBeenCalledOnce();
  });
});

describe('HealthDrawer: reporting (showable-version/50)', () => {
  it('the injury and illness entry points save through the existing declare actions', async () => {
    declareInjuryAction.mockResolvedValue({ ok: true });
    declareIllnessAction.mockResolvedValue({ ok: true });
    openDrawer();
    await vi.waitFor(
      () => expect(declareInjuryAction).toHaveBeenCalledWith({ swim: 'none', bike: 'full', run: 'full' }, null, 'left calf'),
      SLOW,
    );

    const ill = screen.getByRole('button', { name: /^ill/ }) as HTMLButtonElement;
    await vi.waitFor(() => expect(ill.disabled).toBe(false), SLOW);
    fireEvent.click(ill);
    fireEvent.click(screen.getByRole('button', { name: 'saveIllness' }));
    await vi.waitFor(() => expect(declareIllnessAction).toHaveBeenCalledWith(null), SLOW);
  });

  it('opens a blank form after a saved report, so the last one is not offered again', async () => {
    declareInjuryAction.mockResolvedValue({ ok: true });
    openDrawer();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce(), SLOW);

    const report = screen.getByRole('button', { name: /reportInjury/ }) as HTMLButtonElement;
    await vi.waitFor(() => expect(report.disabled).toBe(false), SLOW);
    fireEvent.click(report);

    expect((document.querySelector('[data-field="name"]') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'saveInjury' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the report filled in and read-only under the consent panel, and hides Save', async () => {
    declareInjuryAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    openDrawer();

    await screen.findByText(COPY.title, {}, SLOW);
    expect((screen.getByDisplayValue('left calf') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'saveInjury' })).toBeNull();
  });

  it('Not now clears the consent panel, saves nothing, and leaves the report editable', async () => {
    declareInjuryAction.mockResolvedValue({ ok: false, reason: 'consent-required' });
    openDrawer();

    const notNow = (await screen.findByRole('button', { name: 'consentNotNow' }, SLOW)) as HTMLButtonElement;
    await vi.waitFor(() => expect(notNow.disabled).toBe(false), SLOW);
    fireEvent.click(notNow);

    await vi.waitFor(() => expect(screen.queryByText(COPY.title)).toBeNull(), SLOW);
    expect(grantConsentsAction).not.toHaveBeenCalled();
    expect((screen.getByDisplayValue('left calf') as HTMLInputElement).readOnly).toBe(false);
    expect(screen.getByRole('button', { name: 'saveInjury' })).toBeTruthy();
  });
});
