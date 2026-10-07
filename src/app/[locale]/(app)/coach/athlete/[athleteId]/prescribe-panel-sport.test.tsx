// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { NO_WRITES, type Writes } from '@/features/session/calendar-writes';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./prescribe-actions', () => ({ prescribeSessionAction: vi.fn(async () => ({ ok: true })) }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { PrescribePanel } = await import('./prescribe-panel');
const { prescribeSessionAction } = await import('./prescribe-actions');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Fills the date, picks a sport (or none), presses add, and returns what the writer was handed. */
async function add(sport: string | null) {
  const begin = vi.fn();
  const settle = vi.fn();
  const { container, getByText } = render(
    <PrescribePanel athleteId="ath_1" writer={{ begin, settle } as never} />,
  );
  fireEvent.change(container.querySelector('input[type="date"]') as HTMLInputElement, {
    target: { value: '2026-09-24' },
  });
  if (sport !== null) {
    fireEvent.change(container.querySelector('select[data-field="sport"]') as HTMLSelectElement, {
      target: { value: sport },
    });
  }
  fireEvent.click(getByText('add'));
  await waitFor(() => expect(prescribeSessionAction).toHaveBeenCalled());
  const start = begin.mock.calls[0][0] as (w: Writes) => Writes;
  const [placeholder] = Object.values(start(NO_WRITES).inFlight);
  return { sent: vi.mocked(prescribeSessionAction).mock.calls[0], placeholder };
}

/** `showable-version/52` — the sport the prescribe panel sends and shows. */
describe('PrescribePanel — adding with a sport', () => {
  it('sends the sport picked and shows it on the calendar at once', async () => {
    const { sent, placeholder } = await add('brick');
    expect(sent[0]).toBe('ath_1');
    expect(sent[1]).toMatchObject({ date: '2026-09-24', sport: 'brick' });
    expect(placeholder).toMatchObject({ sport: 'brick', origin: 'head_coach', date: '2026-09-24' });
  });

  it('sends null, not an empty string, when no sport is picked', async () => {
    const { sent, placeholder } = await add(null);
    expect(sent[1]).toHaveProperty('sport', null);
    expect(placeholder?.sport).toBeNull();
  });
});
