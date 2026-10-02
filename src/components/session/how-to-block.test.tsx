import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HowToView } from '@/features/session/how-to';

/**
 * `training-architecture/26` — the how-to as the drawer and the coach's review
 * show it. `t` returns its key and values, so what is asserted is which
 * message is shown and with what.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));

const { HowToBlock } = await import('./how-to-block');

const HOW_TO: HowToView = {
  segments: [
    { name: 'warmUp', minutes: 10, zone: 'Z2', detail: null },
    { name: 'main', minutes: 38, zone: 'Z4', detail: '10 × 1 min, 2 min Z1 between (full recovery)' },
    { name: 'coolDown', minutes: 5, zone: 'Z2', detail: null },
  ],
  focus: ['Build the warm-up from easy to brisk.', 'Keep moving easily in Z1 during the rests.'],
  cue: null,
  byCoach: false,
};

describe('HowToBlock', () => {
  it('shows each segment in order with its minutes, zone and what to do', () => {
    const html = renderToStaticMarkup(<HowToBlock howTo={HOW_TO} />);
    const order = ['data-segment="warmUp"', 'data-segment="main"', 'data-segment="coolDown"'].map((x) => html.indexOf(x));
    expect(order.every((x, i) => x > -1 && (i === 0 || x > order[i - 1]))).toBe(true);
    expect(html).toContain('warmUp()');
    expect(html).toMatch(/38 (<!-- -->)?minutes\(\)/);
    expect(html).toContain('Z4');
    expect(html).toContain('10 × 1 min, 2 min Z1 between (full recovery)');
  });

  it('shows the focus cues, and no Momentum cue or coach mark when there is none', () => {
    const html = renderToStaticMarkup(<HowToBlock howTo={HOW_TO} />);
    expect(html.match(/data-focus/g)).toHaveLength(2);
    expect(html).toContain('Keep moving easily in Z1 during the rests.');
    expect(html).not.toContain('data-momentum-cue');
    expect(html).not.toContain('byCoach()');
    expect(html).toContain('data-how-to="template"');
  });

  it('marks Momentum’s cue as Momentum’s', () => {
    const html = renderToStaticMarkup(<HowToBlock howTo={{ ...HOW_TO, cue: 'Spin light, spare the knee.' }} />);
    expect(html).toMatch(/data-momentum-cue[^>]*>.*momentumCue\(\).*Spin light, spare the knee\./);
  });

  it('says when the coach wrote it, and shows no focus heading without cues', () => {
    const html = renderToStaticMarkup(<HowToBlock howTo={{ ...HOW_TO, focus: [], byCoach: true }} />);
    expect(html).toContain('byCoach()');
    expect(html).toContain('data-how-to="coach"');
    expect(html).not.toContain('focus()');
  });

  it('uses no list items, so it can sit inside a card that is one', () => {
    expect(renderToStaticMarkup(<HowToBlock howTo={HOW_TO} />)).not.toMatch(/<li\b/);
  });
});
