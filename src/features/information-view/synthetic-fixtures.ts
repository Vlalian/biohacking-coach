import { emptyDataset, type InfoDataset } from './dataset';

/**
 * TEST FIXTURES ONLY — never import this from app code.
 *
 * The POC's seeded-PRNG synthetic data provider (`infodata.js`), kept exactly
 * as the ticket prescribes: the provider does not port into the running app,
 * but its named dataset states — 'fresh' (week 1) and 'rich' (26 weeks) —
 * survive as fixtures because they exercise every panel in the catalog, which
 * no small hand-written dataset does. Deterministic: seeded PRNG plus an
 * explicit reference date, so the same inputs always yield the same dataset.
 * All values are synthetic — the 2026-07-09 privacy rule applies to fixtures
 * as much as to docs.
 */

const SPORTS = ['swim', 'bike', 'run'] as const;

const TITLES: Record<string, string[]> = {
  swim: ['Cottonwill Set', 'CSS Intervals', 'Open Water Prep', 'Drill & Pull'],
  bike: ['ME & AE Ride', 'VO2 Max Bike', 'Over-Unders', 'Long Zone 2', 'Speed Skills'],
  run: ['Endurance Run', 'Mona Fartlek', 'Brick Run', 'Easy Run + Pick-ups', 'Tempo Run'],
};

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SYNTHETIC_STATES = ['fresh', 'rich'] as const;
export type SyntheticState = (typeof SYNTHETIC_STATES)[number];

/**
 * A deterministic synthetic dataset. `today` is required on purpose: fixtures
 * must never depend on the wall clock.
 */
export function syntheticDataset(
  state: SyntheticState,
  today: string,
): InfoDataset {
  if (!SYNTHETIC_STATES.includes(state)) {
    throw new Error(`Unknown dataset state: ${state}`);
  }
  const ref = new Date(`${today}T00:00:00`);
  const rnd = mulberry32(state === 'rich' ? 42 : 7);
  const weeks = state === 'rich' ? 26 : 1;
  const D = emptyDataset();
  D.kind = state;
  D.weeksToRace = state === 'rich' ? 8 : 24;
  D.raceName = 'Assundman 70.3';

  let fitness = state === 'rich' ? 30 : 0;
  let fatigue = state === 'rich' ? 30 : 0;

  for (let w = weeks - 1; w >= 0; w--) {
    const phaseRamp = 1 + 0.35 * (1 - w / weeks); // load builds over the block
    const recovery = state === 'rich' && (weeks - w) % 4 === 0; // every 4th week easier
    const planned = state === 'rich' ? 5 + Math.floor(rnd() * 2) : 3;
    let weekTss = 0;
    let weekMin = 0;
    let weekKj = 0;
    let done = 0;
    let skipped = 0;

    for (let s = 0; s < planned; s++) {
      const dayOffset = w * 7 + (6 - Math.floor(rnd() * 7));
      const d = new Date(ref);
      d.setDate(d.getDate() - dayOffset);
      if (d > ref) continue;
      const sport = SPORTS[Math.floor(rnd() * 3)];
      const type = recovery
        ? 'Recovery'
        : ['Endurance', 'Endurance', 'Intensity', 'Tempo', 'Recovery'][
            Math.floor(rnd() * 5)
          ];
      const durMin = Math.round(
        (type === 'Endurance' ? 70 + rnd() * 80 : 40 + rnd() * 45) *
          (recovery ? 0.6 : phaseRamp),
      );
      const isSkipped = state === 'rich' && rnd() < 0.12;
      const tss = Math.round(
        durMin *
          (type === 'Intensity' ? 1.05 : type === 'Tempo' ? 0.85 : type === 'Recovery' ? 0.45 : 0.65),
      );
      const km =
        sport === 'swim'
          ? +(durMin / 30).toFixed(1)
          : sport === 'bike'
            ? Math.round(durMin * 0.48)
            : +(durMin / 5.6).toFixed(1);
      const sess = {
        id: `s${w}-${s}`,
        date: d.toISOString().slice(0, 10),
        week: w,
        title: TITLES[sport][Math.floor(rnd() * TITLES[sport].length)],
        sport: sport as string,
        type,
        durMin,
        km,
        tss,
        power:
          sport === 'bike' && state === 'rich'
            ? Math.round(150 + 60 * (1 - w / weeks) + rnd() * 25)
            : null,
        hr:
          state === 'rich'
            ? Math.round(128 + (type === 'Intensity' ? 25 : 8) + rnd() * 12)
            : null,
        kj: sport === 'bike' ? Math.round(durMin * 9) : null,
        body: null as number | null,
        mind: null as number | null,
        comment: '',
        status: (isSkipped ? 'skipped' : 'done') as 'done' | 'skipped',
      };
      if (!isSkipped) {
        // Body dips in heavy weeks; mind dips on intensity sessions.
        sess.body = Math.max(
          1,
          Math.min(10, Math.round(7 - (phaseRamp - 1) * 5 + rnd() * 3 - (recovery ? -1 : 0))),
        );
        sess.mind = Math.max(
          1,
          Math.min(10, Math.round(7.5 - (type === 'Intensity' ? 1.5 : 0) + rnd() * 2.5)),
        );
        if (rnd() < 0.2) {
          sess.comment = [
            'Felt strong.',
            'Legs heavy from yesterday.',
            '60g carbs/h, worked well.',
            'Cut short — time.',
          ][Math.floor(rnd() * 4)];
        }
        done++;
        weekTss += sess.tss;
        weekMin += durMin;
        weekKj += sess.kj || 0;
      } else skipped++;
      D.sessions.push(sess);
    }

    fitness = fitness + (weekTss / 7 - fitness) * 0.13;
    fatigue = fatigue + (weekTss / 7 - fatigue) * 0.38;
    D.weekly.push({
      week: w,
      tss: weekTss,
      minutes: weekMin,
      kj: weekKj,
      done,
      skipped,
      fitness: Math.round(fitness),
      fatigue: Math.round(fatigue),
      form: Math.round(fitness - fatigue),
      // Zone distribution is wearable-derived: null in 'fresh' (no strap yet).
      zones:
        state !== 'rich' ? null : recovery ? [55, 30, 10, 4, 1] : [38, 27, 17, 12, 6],
      longest: Math.max(
        0,
        ...D.sessions
          .filter((x) => x.week === w && x.status === 'done')
          .map((x) => x.durMin || 0),
      ),
    });

    D.checkins.push({
      week: w,
      energy: Math.max(1, Math.min(10, Math.round(7 - (phaseRamp - 1) * 6 + rnd() * 3))),
      sleepq: Math.max(1, Math.min(10, Math.round(6.5 + rnd() * 3 - (phaseRamp - 1) * 3))),
      mood: Math.max(1, Math.min(10, Math.round(7 + rnd() * 2.5 - (phaseRamp - 1) * 2))),
      motivation: Math.max(1, Math.min(10, Math.round(8 - (weeks - w) * 0.05 + rnd() * 2))),
    });
  }

  const sleepDays = state === 'rich' ? 30 : 4;
  for (let i = sleepDays - 1; i >= 0; i--) {
    D.sleep.push({ day: i, hours: +(5.8 + rnd() * 2.6).toFixed(1), feeling: Math.ceil(rnd() * 5) });
  }

  if (state === 'rich') {
    // Wearable-dependent bests: absent in 'fresh' (no power meter / strap yet).
    const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    months.forEach((m, i) => {
      const g = i / months.length;
      D.peaksPower.push({
        label: m,
        '5s': Math.round(680 + g * 190 + rnd() * 30),
        '1m': Math.round(340 + g * 80 + rnd() * 20),
        '5m': Math.round(255 + g * 50 + rnd() * 15),
        '20m': Math.round(215 + g * 40 + rnd() * 10),
        '60m': Math.round(190 + g * 35 + rnd() * 10),
      });
      D.peaksHr.push({
        label: m,
        '5s': Math.round(186 + rnd() * 8),
        '1m': Math.round(180 + rnd() * 6),
        '5m': Math.round(174 + rnd() * 5),
        '20m': Math.round(168 + rnd() * 5),
        '60m': Math.round(160 + rnd() * 5),
      });
    });

    // Recent personal bests — dated PB events, newest first.
    const BEST_KINDS: Array<[string, string, (v: number) => string]> = [
      ['bestPower5s', 'bike', (v) => `${Math.round(820 + v * 60)} W`],
      ['bestPower1m', 'bike', (v) => `${Math.round(400 + v * 30)} W`],
      ['bestHr5s', 'run', (v) => `${Math.round(192 + v * 6)} bpm`],
      ['bestRun400', 'run', (v) => `${(78 - v * 5).toFixed(1)} s`],
      ['bestSwim100', 'swim', (v) => `${(92 - v * 6).toFixed(1)} s`],
    ];
    const bestWeeks = [0, 1, 1, 3, 5, 8, 12];
    bestWeeks.forEach((w, i) => {
      const [metricKey, sport, fmt] = BEST_KINDS[i % BEST_KINDS.length];
      const d = new Date(ref);
      d.setDate(d.getDate() - (w * 7 + Math.floor(rnd() * 6)));
      D.bests.push({ date: d.toISOString().slice(0, 10), week: w, metricKey, sport, value: fmt(rnd()) });
    });
    D.bests.sort((a, b) => b.date.localeCompare(a.date));
  }

  // The generation loop runs w = oldest → current, so weekly/checkins are
  // already oldest → newest. (week numbers count DOWN toward now: 25 = oldest.)
  return D;
}
