import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HealthSpan } from '@/features/health/health-layer';

/**
 * `showable-version/28e` — the one current-status card above the calendar.
 * Two lines, today only: "Uninjured · Healthy" muted on a clean day, the open
 * part named in signal otherwise. Each line is a door into the Health Drawer.
 */
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const { HealthStatusCard } = await import('./health-status-card');

const span = (kind: HealthSpan['kind'], over: Partial<HealthSpan> = {}): HealthSpan => ({
  kind,
  id: `${kind}_1`,
  from: '2026-09-10',
  to: null,
  bother: null,
  name: null,
  openedAt: new Date('2026-09-10T08:00:00Z'),
  ...over,
});

const renderCard = (spans: HealthSpan[]) =>
  renderToStaticMarkup(<HealthStatusCard spans={spans} onOpen={() => {}} />);

describe('HealthStatusCard', () => {
  it('reads Uninjured · Healthy on a clean day, and names an open injury in signal', () => {
    const clean = renderCard([]);
    expect(clean).toMatch(/statusUninjured[^]*statusHealthy/);
    expect(clean).not.toContain('data-active="true"');

    const html = renderCard([span('injury', { name: 'left knee' })]);
    expect(html).toContain('left knee');
    expect(html).toMatch(/data-status="injury"[^>]*data-active="true"/);
    expect(html).toMatch(/statusInjured: left knee/);
    expect(html).toMatch(/data-status="illness"[^>]*data-active="false"/);
  });

  it('says ill while an illness is open, and an unnamed injury as the word alone', () => {
    const html = renderCard([span('injury'), span('illness')]);
    expect(html).toMatch(/data-status="illness"[^>]*data-active="true"[^]*statusIll</);
    expect(html).toMatch(/statusInjured</);
  });

  it('says nothing about the past: a closed record leaves it clean', () => {
    const html = renderCard([span('injury', { name: 'ankle', to: '2026-09-12' })]);
    expect(html).not.toContain('ankle');
    expect(html).toContain('statusUninjured');
  });

  it('is the one data-health-status on the page', () => {
    expect(renderCard([]).match(/data-health-status/g)).toHaveLength(1);
  });
});
