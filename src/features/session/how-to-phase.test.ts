import { describe, it, expect } from 'vitest';
import { howToFor, howToOf, type HowTo } from './how-to';

/**
 * `training-architecture/55`: the rest between Intensity reps follows the phase
 * (§08, "Hvem gør hvad"). Close to the race a rep under 2 min rests as long as
 * it worked; every other case keeps the rep-length rule.
 *
 * `howToFor` and `howToOf` take the phase as a third argument, so these tests
 * pass it directly rather than a date.
 */
const COACH: HowTo = {
  segments: [
    { name: 'warmUp', minutes: 20, zone: 'Z2', detail: null },
    { name: 'main', minutes: 60, zone: 'Z3', detail: 'Hills, seated' },
    { name: 'coolDown', minutes: 10, zone: 'Z1', detail: null },
  ],
  focus: ['Stay seated on the climbs'],
};

type Planned = Parameters<typeof howToOf>[0];
const s = (over: Partial<Planned> = {}): Planned => ({
  origin: 'arithmetic',
  type: 'Endurance',
  sport: 'bike',
  duration: 90,
  zone: 'Z2',
  howTo: null,
  ...over,
});

const mainDetail = (h: { segments: { name: string; detail: string | null }[] } | null) =>
  h!.segments.find((x) => x.name === 'main')!.detail;

describe('howToFor with a phase', () => {
  it('rests a 1-minute Intensity rep one minute when the race is close, not marked full recovery (§08, Hvem gør hvad)', () => {
    // 60 min run: 10 warm-up, 5 cool-down, 45 main. Ten 1-minute reps with 1 min
    // rest take 10 + 9 = 19 min; 26 go steady in Z2.
    const h = howToFor({ type: 'Intensity', sport: 'run', durationMinutes: 60, zone: 'Z4' }, 'en', 'close')!;
    expect(h.segments).toEqual([
      { name: 'warmUp', minutes: 10, zone: 'Z2', detail: null },
      { name: 'steady', minutes: 26, zone: 'Z2', detail: null },
      { name: 'main', minutes: 19, zone: 'Z4', detail: '10 × 1 min, 1 min Z1 between' },
      { name: 'coolDown', minutes: 5, zone: 'Z2', detail: null },
    ]);
  });

  it('changes only a rep under 2 min, and only when the phase is close', () => {
    const inputs = [
      { type: 'Intensity', sport: 'bike', durationMinutes: 30, zone: 'Z4' },
      { type: 'Intensity', sport: 'bike', durationMinutes: 25, zone: 'Z4' },
      { type: 'Tempo', sport: 'bike', durationMinutes: 75, zone: 'Z3' },
      { type: 'Tempo', sport: 'run', durationMinutes: 40, zone: 'Z3' },
    ];
    for (const input of inputs) {
      expect(howToFor(input, 'en', 'close')).toEqual(howToFor(input, 'en'));
      expect(howToFor(input, 'en', 'early')).toEqual(howToFor(input, 'en'));
    }
    const short = { type: 'Intensity', sport: 'run', durationMinutes: 60, zone: 'Z4' };
    expect(howToFor(short, 'en', 'early')).toEqual(howToFor(short, 'en'));
    expect(mainDetail(howToFor(short, 'en'))).toBe('10 × 1 min, 2 min Z1 between (full recovery)');
    expect(mainDetail(howToFor(short, 'en', 'close'))).not.toBe(mainDetail(howToFor(short, 'en')));
  });
});

describe('howToOf with a phase', () => {
  it('fits the close rest through howToOf, and a coach’s own how-to ignores the phase', () => {
    const run = s({ type: 'Intensity', sport: 'run', duration: 60, zone: 'Z4' });
    expect(mainDetail(howToOf(run, 'en', 'close'))).toBe('10 × 1 min, 1 min Z1 between');
    expect(howToOf(run, 'en', 'early')).toEqual(howToOf(run, 'en'));
    expect(howToOf({ ...run, howTo: { coach: COACH } }, 'en', 'close')).toEqual({ ...COACH, cue: null, byCoach: true });
  });
});
