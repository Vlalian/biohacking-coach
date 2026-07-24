import { describe, it, expect } from 'vitest';
import { buildDataset, bestRollingMean, type SessionInput } from './build-dataset';

const TODAY = '2026-07-14'; // a Tuesday; week starts Monday 2026-07-13

const input = (over: Partial<SessionInput> = {}): SessionInput => ({
  id: 'a',
  date: '2026-07-13',
  status: 'completed',
  isTraining: true,
  type: 'Endurance',
  title: 'Morning Ride',
  duration: 60,
  sport: null,
  summary: null,
  feedbackBody: null,
  feedbackMind: null,
  feedbackComment: null,
  ...over,
});

describe('buildDataset — which rows count', () => {
  it('keeps only past-or-today completed/skipped training sessions', () => {
    const D = buildDataset(
      [
        input({ id: 'done' }),
        input({ id: 'skipped', status: 'skipped' }),
        input({ id: 'planned', status: 'planned' }),
        input({ id: 'future', date: '2026-07-15' }),
        input({ id: 'nontraining', isTraining: false }),
      ],
      {},
      TODAY,
    );
    expect(D.sessions.map((s) => s.id).sort()).toEqual(['done', 'skipped']);
    expect(D.sessions.find((s) => s.id === 'skipped')?.status).toBe('skipped');
  });

  it('no qualifying rows yields the empty dataset — the empty-state case', () => {
    const D = buildDataset([input({ status: 'planned' })], {}, TODAY);
    expect(D.sessions).toHaveLength(0);
    expect(D.weekly).toHaveLength(0);
  });
});

describe('buildDataset — session mapping', () => {
  it('maps Session Reflection 1–5 onto the RPE-style 1–10 axis', () => {
    const D = buildDataset(
      [input({ feedbackBody: 3, feedbackMind: 5, feedbackComment: 'strong' })],
      {},
      TODAY,
    );
    expect(D.sessions[0].body).toBe(6);
    expect(D.sessions[0].mind).toBe(10);
    expect(D.sessions[0].comment).toBe('strong');
  });

  it('derives sport bucket, km, and kJ from Garmin provenance', () => {
    const D = buildDataset(
      [
        input({
          sport: 'CYCLING',
          summary: { avgPowerW: 200, avgHr: 140, distanceM: 30000 },
        }),
      ],
      {},
      TODAY,
    );
    const s = D.sessions[0];
    expect(s.sport).toBe('bike');
    expect(s.km).toBe(30);
    expect(s.hr).toBe(140);
    expect(s.power).toBe(200);
    expect(s.kj).toBe(720); // 200 W × 3600 s / 1000
  });

  it('a session without provenance keeps honest nulls (and null TSS until the calc module)', () => {
    const D = buildDataset([input()], {}, TODAY);
    const s = D.sessions[0];
    expect(s.sport).toBeNull();
    expect(s.km).toBeNull();
    expect(s.kj).toBeNull();
    expect(s.tss).toBeNull();
  });

  it('weeks count down toward today, split on Mondays', () => {
    const D = buildDataset(
      [
        input({ id: 'thisweek', date: '2026-07-13' }),
        input({ id: 'lastweek', date: '2026-07-12' }),
        input({ id: 'old', date: '2026-06-01' }),
      ],
      {},
      TODAY,
    );
    const week = (id: string) => D.sessions.find((s) => s.id === id)?.week;
    expect(week('thisweek')).toBe(0);
    expect(week('lastweek')).toBe(1);
    expect(week('old')).toBe(6);
  });
});

describe('buildDataset — weekly aggregation', () => {
  it('aggregates minutes, counts, and longest per week; fitness stays null', () => {
    const D = buildDataset(
      [
        input({ id: 'a', duration: 60 }),
        input({ id: 'b', duration: 90, date: '2026-07-14' }),
        input({ id: 'c', status: 'skipped' }),
      ],
      {},
      TODAY,
    );
    expect(D.weekly).toHaveLength(1);
    const w = D.weekly[0];
    expect(w.minutes).toBe(150);
    expect(w.done).toBe(2);
    expect(w.skipped).toBe(1);
    expect(w.longest).toBe(90);
    expect(w.fitness).toBeNull();
    expect(w.tss).toBeNull();
  });

  it('covers every week back to the oldest session, empty weeks included', () => {
    const D = buildDataset(
      [input({ id: 'now' }), input({ id: 'old', date: '2026-06-29' })],
      {},
      TODAY,
    );
    expect(D.weekly.map((w) => w.week)).toEqual([2, 1, 0]);
    expect(D.weekly[1].done).toBe(0);
  });
});

describe('buildDataset — zones from HR streams', () => {
  it('bins stream samples against observed max HR', () => {
    // maxHr observed = 200 (from the stream itself). Bands at <120, <140,
    // <160, <180, rest — one sample in each of Z1..Z5.
    const D = buildDataset([input({ id: 'a' })], {
      a: { t: [0, 10, 20, 30, 40], hr: [100, 130, 150, 170, 200] },
    }, TODAY);
    expect(D.weekly[0].zones).toEqual([20, 20, 20, 20, 20]);
  });

  it('no HR data anywhere → zones stay null', () => {
    const D = buildDataset([input()], {}, TODAY);
    expect(D.weekly[0].zones).toBeNull();
  });

  it('summary maxHr raises the anchor even without a stream for that session', () => {
    const D = buildDataset(
      [
        input({ id: 'a' }),
        input({ id: 'anchor', summary: { maxHr: 200 }, date: '2026-07-14' }),
      ],
      { a: { t: [0], hr: [100] } },
      TODAY,
    );
    // 100 / 200 = 0.5 → Z1 only.
    expect(D.weekly[0].zones).toEqual([100, 0, 0, 0, 0]);
  });
});

describe('buildDataset — peaks and bests', () => {
  it('monthly best rolling means and dated all-time bests from power streams', () => {
    const power = Array.from({ length: 8 }, (_, i) => 100 + i * 10); // 100..170
    const D = buildDataset(
      [input({ id: 'a', sport: 'cycling' })],
      { a: { t: power.map((_, i) => i * 10), powerW: power } },
      TODAY,
    );
    expect(D.peaksPower).toHaveLength(1);
    expect(D.peaksPower[0].label).toBe('Jul');
    expect(D.peaksPower[0]['5s']).toBe(170); // best single 10 s bin
    expect(D.peaksPower[0]['1m']).toBe(145); // best mean of 6 bins: 120..170
    expect(D.peaksPower[0]['5m']).toBeUndefined(); // series shorter than window
    const best5s = D.bests.find((b) => b.metricKey === 'bestPower5s');
    expect(best5s).toMatchObject({ value: '170 W', sport: 'bike', date: '2026-07-13' });
  });

  it('no streams → no peaks, no bests', () => {
    const D = buildDataset([input()], {}, TODAY);
    expect(D.peaksPower).toHaveLength(0);
    expect(D.peaksHr).toHaveLength(0);
    expect(D.bests).toHaveLength(0);
  });
});

describe('bestRollingMean', () => {
  it('finds the best window mean, treating gaps as zero', () => {
    expect(bestRollingMean([10, 20, 30], 2)).toBe(25);
    expect(bestRollingMean([10, null, 30], 2)).toBe(15);
  });
  it('returns null when the series is shorter than the window', () => {
    expect(bestRollingMean([10], 2)).toBeNull();
    expect(bestRollingMean([], 1)).toBeNull();
  });
});
