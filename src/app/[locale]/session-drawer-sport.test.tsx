// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { Session } from '@/features/session/session';
import { NO_WRITES, type Writes } from '@/features/session/calendar-writes';

/**
 * `showable-version/52` — the sport a form submits. The static-markup tests show
 * what the forms offer; these pick a sport, press save, and read what the drawer
 * sends to the server and what it shows on the calendar before the answer.
 */
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/shell/coach-overlay-context', () => ({
  useCoachOverlay: () => ({ setReference: vi.fn(), setOpen: vi.fn() }),
}));
vi.mock('./garmin-actions', () => ({ undoDetectedImportAction: vi.fn() }));
vi.mock('./(app)/coach/athlete/[athleteId]/prescribe-actions', () => ({
  deletePrescribedSessionAction: vi.fn(),
  editPrescribedSessionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./session-actions', () => ({
  markCompleteAction: vi.fn(),
  toggleSkipAction: vi.fn(),
  toggleUnavailableAction: vi.fn(),
  createAthleteSessionAction: vi.fn(async () => ({ ok: true })),
  updateAthleteSessionAction: vi.fn(async () => ({ ok: true })),
  deleteAthleteSessionAction: vi.fn(),
}));
vi.mock('./(app)/settings/settings-actions', () => ({ addRaceAction: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { SessionDrawer } = await import('./session-drawer');
const { createAthleteSessionAction, updateAthleteSessionAction } = await import('./session-actions');
const { editPrescribedSessionAction } = await import('./(app)/coach/athlete/[athleteId]/prescribe-actions');

const TODAY = '2026-07-15';

const session = (over: Partial<Session> = {}): Session => ({
  id: 's1',
  date: '2026-07-20',
  version: 3,
  type: 'Strength',
  status: 'planned',
  parked: false,
  sport: null,
  dayOrder: 0,
  title: null,
  duration: 60,
  zone: null,
  note: null,
  feedbackBody: null,
  feedbackMind: null,
  feedbackComment: null,
  origin: 'athlete',
  isTraining: true,
  summary: null,
  howTo: null,
  ...over,
});

type State = Parameters<typeof SessionDrawer>[0]['state'];

function open(state: State, sessions: Session[], coachAthleteId?: string) {
  const onBeginWrite = vi.fn();
  const view = render(
    <SessionDrawer
      state={state}
      sessions={sessions}
      coachAthleteId={coachAthleteId}
      importedSessionIds={[]}
      locale="en"
      todayKey={TODAY}
      onClose={() => {}}
      onRate={() => {}}
      onEditRequest={() => {}}
      onChoose={() => {}}
      currentTargetRace={null}
      onBeginWrite={onBeginWrite}
      onSettleWrite={() => {}}
      inFlightIds={[]}
    />,
  );
  const select = view.container.querySelector('select[data-field="sport"]') as HTMLSelectElement;
  const form = view.container.querySelector('form') as HTMLFormElement;
  /** The writes the calendar would show the moment save is pressed. */
  const shownWrites = (shown: Session[]): Writes => {
    const start = onBeginWrite.mock.calls[0][0] as (w: Writes, s: Session[]) => Writes;
    return start(NO_WRITES, shown);
  };
  return { select, form, shownWrites };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the athlete’s create form submits its sport', () => {
  const create: State = { open: true, mode: 'create', date: '2026-08-16' };

  it('sends the sport picked to the server and draws it on the calendar at once', async () => {
    const { select, form, shownWrites } = open(create, []);
    fireEvent.change(select, { target: { value: 'misc' } });
    fireEvent.submit(form);
    await waitFor(() => expect(createAthleteSessionAction).toHaveBeenCalled());
    expect(createAthleteSessionAction).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-08-16', sport: 'misc' }));
    const [placeholder] = Object.values(shownWrites([]).inFlight);
    expect(placeholder).toMatchObject({ sport: 'misc', origin: 'athlete', date: '2026-08-16' });
  });

  it('sends null, not an empty string, when no sport is picked', async () => {
    const { form, shownWrites } = open(create, []);
    fireEvent.submit(form);
    await waitFor(() => expect(createAthleteSessionAction).toHaveBeenCalled());
    expect(vi.mocked(createAthleteSessionAction).mock.calls[0][0]).toHaveProperty('sport', null);
    const [placeholder] = Object.values(shownWrites([]).inFlight);
    expect(placeholder?.sport).toBeNull();
  });
});

describe('the athlete’s edit form submits its sport', () => {
  const edit: State = { open: true, mode: 'edit', sessionId: 's1' };

  it('keeps the stored sport when nothing is changed', async () => {
    const stored = session({ sport: 'mobility' });
    const { select, form, shownWrites } = open(edit, [stored]);
    expect(select.value).toBe('mobility');
    fireEvent.submit(form);
    await waitFor(() => expect(updateAthleteSessionAction).toHaveBeenCalled());
    expect(vi.mocked(updateAthleteSessionAction).mock.calls[0][1]).toMatchObject({ sport: 'mobility' });
    expect(shownWrites([stored]).inFlight.s1?.sport).toBe('mobility');
  });

  it('sends the sport picked instead, and null when the pick is cleared', async () => {
    const stored = session({ sport: 'mobility' });
    const first = open(edit, [stored]);
    fireEvent.change(first.select, { target: { value: 'swim' } });
    fireEvent.submit(first.form);
    await waitFor(() => expect(updateAthleteSessionAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateAthleteSessionAction).mock.calls[0][1]).toMatchObject({ sport: 'swim' });
    expect(first.shownWrites([stored]).inFlight.s1?.sport).toBe('swim');
    cleanup();

    const second = open(edit, [stored]);
    fireEvent.change(second.select, { target: { value: '' } });
    fireEvent.submit(second.form);
    await waitFor(() => expect(updateAthleteSessionAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateAthleteSessionAction).mock.calls[1][1]).toHaveProperty('sport', null);
    expect(second.shownWrites([stored]).inFlight.s1?.sport).toBeNull();
  });

  it('starts empty for a sport label outside the seven, and submits none', async () => {
    const stored = session({ sport: 'cycling' });
    const { select, form } = open(edit, [stored]);
    expect(select.value).toBe('');
    fireEvent.submit(form);
    await waitFor(() => expect(updateAthleteSessionAction).toHaveBeenCalled());
    expect(vi.mocked(updateAthleteSessionAction).mock.calls[0][1]).toHaveProperty('sport', null);
  });
});

describe('the Head Coach’s edit form submits its sport', () => {
  const edit: State = { open: true, mode: 'edit', sessionId: 's1' };
  const prescribed = (over: Partial<Session> = {}) => session({ origin: 'head_coach', type: 'Tempo', ...over });

  it('keeps the stored sport when nothing is changed, and shows it on the calendar', async () => {
    const stored = prescribed({ sport: 'run' });
    const { select, form, shownWrites } = open(edit, [stored], 'ath_1');
    expect(select.value).toBe('run');
    fireEvent.submit(form);
    await waitFor(() => expect(editPrescribedSessionAction).toHaveBeenCalled());
    expect(vi.mocked(editPrescribedSessionAction).mock.calls[0][2]).toMatchObject({ sport: 'run' });
    expect(shownWrites([stored]).inFlight.s1?.sport).toBe('run');
  });

  it('sends the sport picked, and null when the pick is cleared', async () => {
    const stored = prescribed({ sport: 'run' });
    const first = open(edit, [stored], 'ath_1');
    fireEvent.change(first.select, { target: { value: 'brick' } });
    fireEvent.submit(first.form);
    await waitFor(() => expect(editPrescribedSessionAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(editPrescribedSessionAction).mock.calls[0][2]).toMatchObject({ sport: 'brick' });
    expect(first.shownWrites([stored]).inFlight.s1?.sport).toBe('brick');
    cleanup();

    const second = open(edit, [stored], 'ath_1');
    fireEvent.change(second.select, { target: { value: '' } });
    fireEvent.submit(second.form);
    await waitFor(() => expect(editPrescribedSessionAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(editPrescribedSessionAction).mock.calls[1][2]).toHaveProperty('sport', null);
    expect(second.shownWrites([stored]).inFlight.s1?.sport).toBeNull();
  });

  it('starts empty for a sport label outside the seven, and submits none', async () => {
    const stored = prescribed({ sport: 'strength_training' });
    const { select, form } = open(edit, [stored], 'ath_1');
    expect(select.value).toBe('');
    fireEvent.submit(form);
    await waitFor(() => expect(editPrescribedSessionAction).toHaveBeenCalled());
    expect(vi.mocked(editPrescribedSessionAction).mock.calls[0][2]).toHaveProperty('sport', null);
  });
});
