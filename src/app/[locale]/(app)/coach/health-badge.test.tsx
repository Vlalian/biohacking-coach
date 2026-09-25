import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HealthBadge } from './health-badge';

/**
 * `showable-version/28b` — what is open, where the Head Coach meets the athlete.
 */
const render = (openHealth: Parameters<typeof HealthBadge>[0]['openHealth']) =>
  renderToStaticMarkup(
    <HealthBadge openHealth={openHealth} injuryLabel="injuryLabel" illLabel="illLabel" />,
  );

describe('HealthBadge', () => {
  it('names each open injury, and says the athlete is ill', () => {
    expect(render({ injuries: ['left knee'], ill: false })).toContain('left knee');
    expect(render({ injuries: ['left knee', 'achilles'], ill: false })).toContain('achilles');
    const both = render({ injuries: ['left knee'], ill: true });
    expect(both).toContain('left knee');
    expect(both).toContain('illLabel');
  });

  it('names an injury the athlete never named', () => {
    expect(render({ injuries: [null], ill: false })).toContain('injuryLabel');
  });

  it('renders nothing for an athlete with nothing open — and nothing, identically, for one who withheld', () => {
    // The two must be indistinguishable. A badge that appeared only for
    // shared-and-healthy would let a coach read health from its absence.
    expect(render({ injuries: [], ill: false })).toBe('');
    expect(render(null)).toBe('');
  });
});
