import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})`,
}));
vi.mock('./briefing-actions', () => ({ startBriefingAction: vi.fn(), sendBriefingMessageAction: vi.fn() }));

const { Briefing, BriefingOpener } = await import('./briefing');

/** The Briefing says it is reading the week, with the estimate, from click to reply (training-architecture/29). */
describe('BriefingOpener', () => {
  it('idle: the open button and no status', () => {
    const html = renderToStaticMarkup(<BriefingOpener pending={false} onStart={() => {}} />);
    expect(html).toContain('start()');
    expect(html).not.toContain('role="status"');
  });

  it('pending: the button and a live status both read the week with the shared estimate', () => {
    const html = renderToStaticMarkup(<BriefingOpener pending onStart={() => {}} />);
    expect(html).toContain(`starting(seconds=${COACH_EXPECTED_SECONDS})`);
    expect(html).toContain('role="status"');
    expect(html).toContain('disabled=""');
  });

  it('with no briefing yet, the panel is the opener', () => {
    const html = renderToStaticMarkup(<Briefing athleteId="a1" initial={null} />);
    expect(html).toContain('start()');
  });
});
