// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HoursChangePreview } from '@/features/coach/hours-change';

/**
 * showable-version/61 — which answer each of the hours dialog's buttons sends
 * (CodeRabbit on PR #133). The static tests show what it says; these press it.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));

const { HoursChangeDialog } = await import('./hours-change-dialog');

const W41 = '2026-10-05';
const W42 = '2026-10-12';

afterEach(cleanup);

function press(preview: HoursChangePreview, label: string) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(<HoursChangeDialog hours={10} preview={preview} pending={false} onApply={onApply} onCancel={onCancel} />);
  fireEvent.click(screen.getByText(label));
  return { onApply, onCancel };
}

describe('HoursChangeDialog — what each button answers', () => {
  const choose: HoursChangePreview = { kind: 'choose', waitingWeek: W41, weeks: [W41, W42], weeksIfKept: [W42] };

  it('"Start from week 41" redraws the waiting week, "Start from week 42" keeps it, Cancel answers nothing', () => {
    expect(press(choose, 'hoursStartFrom(week=41)').onApply).toHaveBeenCalledWith('waiting-week');
    cleanup();
    expect(press(choose, 'hoursStartFrom(week=42)').onApply).toHaveBeenCalledWith('week-after');
    cleanup();
    const cancelled = press(choose, 'hoursCancel()');
    expect(cancelled.onCancel).toHaveBeenCalledOnce();
    expect(cancelled.onApply).not.toHaveBeenCalled();
  });

  it('a coach preparing the week and a draft being written both answer only the week after', () => {
    expect(press({ kind: 'coach-preparing', waitingWeek: W41, weeks: [W42] }, 'hoursStartFrom(week=42)').onApply).toHaveBeenCalledWith('week-after');
    cleanup();
    expect(press({ kind: 'drafting', week: W41, weeks: [W42] }, 'hoursStartFrom(week=42)').onApply).toHaveBeenCalledWith('week-after');
  });

  it('the plain confirm answers the week after: there is no waiting draft to withdraw', () => {
    expect(press({ kind: 'confirm', weeks: [W42], plannedWeek: null }, 'hoursConfirm()').onApply).toHaveBeenCalledWith('week-after');
  });
});
