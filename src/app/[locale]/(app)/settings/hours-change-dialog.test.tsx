import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HoursChangePreview } from '@/features/coach/hours-change';

/**
 * showable-version/61 — what the hours confirm dialog asks, per case. Static
 * markup; the key-echo `t` sorts its values so an assertion names exactly the
 * numbers each line is given.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));

const { HoursChangeDialog } = await import('./hours-change-dialog');

// ISO weeks: 2026-10-05 is week 41, 10-12 week 42, 11-23 week 48.
const W41 = '2026-10-05';
const W42 = '2026-10-12';
const W48 = '2026-11-23';

const render = (preview: HoursChangePreview) =>
  renderToStaticMarkup(
    <HoursChangeDialog hours={10} preview={preview} pending={false} onApply={() => {}} onCancel={() => {}} />,
  );

describe('HoursChangeDialog', () => {
  it('names the waiting week and offers week 41, week 42 and Cancel', () => {
    const html = render({ kind: 'choose', waitingWeek: W41, weeks: [W41, W42, W48], weeksIfKept: [W42, W48] });
    expect(html).toContain('hoursConfirmTitle(hours=10)');
    expect(html).toContain('hoursWaitingDraft(week=41)');
    expect(html).toContain('hoursStartFrom(week=41)');
    expect(html).toContain('hoursStartFromWaitingNote(first=41,hours=10,last=48,week=41)');
    expect(html).toContain('hoursStartFrom(week=42)');
    expect(html).toContain('hoursKeptNote(hours=10,week=41)');
    expect(html).toContain('hoursCancel()');
  });

  it('in a coach’s preview, says so and never offers the waiting week', () => {
    const html = render({ kind: 'coach-preparing', waitingWeek: W41, weeks: [W42] });
    expect(html).toContain('hoursCoachPreparing(after=42,week=41)');
    expect(html).toContain('hoursStartFrom(week=42)');
    expect(html).not.toContain('hoursStartFrom(week=41)');
  });

  it('with no waiting draft: confirm/cancel saying which weeks change, naming an accepted week', () => {
    const html = render({ kind: 'confirm', weeks: [W42, W48], plannedWeek: W41 });
    expect(html).toContain('hoursPlannedStays(week=41)');
    expect(html).toContain('hoursRedrawWeeks(count=2,first=42,hours=10,last=48)');
    expect(html).toContain('hoursConfirm()');
    expect(html).not.toContain('hoursStartFrom');
    const nothing = render({ kind: 'confirm', weeks: [], plannedWeek: null });
    expect(nothing).toContain('hoursNothingToRedraw()');
    expect(nothing).not.toContain('hoursPlannedStays');
  });

  // Review of 61 (Mads, 2026-11-02): never a lock while the Coach is down.
  it('while a draft is being written: keeps that week and offers the week after, never the drafted week', () => {
    const html = render({ kind: 'drafting', week: W41, weeks: [W42, W48] });
    expect(html).toContain('hoursDrafting(after=42,week=41)');
    expect(html).toContain('hoursDraftingNote(hours=10,week=41)');
    expect(html).toContain('hoursRedrawWeeks(count=2,first=42,hours=10,last=48)');
    expect(html).toContain('hoursStartFrom(week=42)');
    expect(html).toContain('hoursCancel()');
    expect(html).not.toContain('hoursStartFrom(week=41)');
    expect(html).not.toContain('hoursTryAgain');
  });

  it('names the week after by date, so the year turns over: after week 53 comes week 1', () => {
    // 2026-12-28 is the Monday of ISO week 53; the next Monday is week 1 of 2027.
    const html = render({ kind: 'choose', waitingWeek: '2026-12-28', weeks: ['2026-12-28', '2027-01-04'], weeksIfKept: ['2027-01-04'] });
    expect(html).toContain('hoursStartFrom(week=53)');
    expect(html).toContain('hoursStartFrom(week=1)');
  });
});
