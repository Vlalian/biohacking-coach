import { describe, it, expect } from 'vitest';
import { howToFor, howToOf, storedHowToFrom, cueFrom, coachHowToFrom, type HowTo, type HowToSegment } from './how-to';
import { HOW_TO_TEMPLATES, HOW_TO_SPORTS, FUELLING_CUE, INTENSITY_REST } from './how-to-templates';

const sum = (segments: HowToSegment[]): number => segments.reduce((t, x) => t + x.minutes, 0);
const names = (h: HowTo | null) => h?.segments.map((x) => x.name);

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

const COACH: HowTo = {
  segments: [
    { name: 'warmUp', minutes: 20, zone: 'Z2', detail: null },
    { name: 'main', minutes: 60, zone: 'Z3', detail: 'Hills, seated' },
    { name: 'coolDown', minutes: 10, zone: 'Z1', detail: null },
  ],
  focus: ['Stay seated on the climbs'],
};

describe('howToFor — the structure', () => {
  it('splits a session into warm-up, main and cool-down that add up to its minutes', () => {
    const h = howToFor({ type: 'Endurance', sport: 'bike', durationMinutes: 90, zone: 'Z2' }, 'en');
    expect(names(h)).toEqual(['warmUp', 'main', 'coolDown']);
    expect(sum(h!.segments)).toBe(90);
  });

  it('warms up 5, 10 or 15 minutes by the session length, and cools down for less (§07)', () => {
    const minutes = (d: number) => howToFor({ type: 'Recovery', sport: null, durationMinutes: d, zone: 'Z1' }, 'en')!.segments.map((x) => x.minutes);
    expect(minutes(20)).toEqual([5, 12, 3]);
    expect(minutes(44)).toEqual([5, 36, 3]);
    expect(minutes(45)).toEqual([10, 30, 5]);
    expect(minutes(89)).toEqual([10, 74, 5]);
    expect(minutes(90)).toEqual([15, 70, 5]);
  });

  it('keeps a session too short to split as one block', () => {
    const h = howToFor({ type: 'Endurance', sport: 'run', durationMinutes: 19, zone: 'Z2' }, 'en');
    expect(h!.segments).toEqual([{ name: 'main', minutes: 19, zone: 'Z2', detail: null }]);
  });

  it('has no how-to without minutes, or for a type no template covers', () => {
    expect(howToFor({ type: 'Endurance', sport: 'bike', durationMinutes: null, zone: 'Z2' }, 'en')).toBeNull();
    expect(howToFor({ type: 'Strength', sport: null, durationMinutes: 45, zone: null }, 'en')).toBeNull();
  });

  it('warms up and cools down in Z2, never above the session’s own zone', () => {
    const endurance = howToFor({ type: 'Intensity', sport: 'bike', durationMinutes: 60, zone: 'Z4' }, 'en')!;
    expect(endurance.segments[0].zone).toBe('Z2');
    expect(endurance.segments.at(-1)!.zone).toBe('Z2');
    const recovery = howToFor({ type: 'Recovery', sport: 'run', durationMinutes: 40, zone: 'Z1' }, 'en')!;
    expect(recovery.segments.map((x) => x.zone)).toEqual(['Z1', 'Z1', 'Z1']);
  });

  it('runs the main part at the session’s zone, or at the type’s zone when it has none it can use', () => {
    const zoneOf = (type: string, zone: string | null) =>
      howToFor({ type, sport: null, durationMinutes: 60, zone }, 'en')!.segments.find((x) => x.name === 'main')!.zone;
    expect(zoneOf('Endurance', 'Z3')).toBe('Z3');
    expect(zoneOf('Endurance', null)).toBe('Z2');
    expect(zoneOf('Tempo', 'Z3-Z4')).toBe('Z3');
    expect(zoneOf('Intensity', 'hard')).toBe('Z4');
    expect(zoneOf('Recovery', null)).toBe('Z1');
  });
});

describe('howToFor — the main set (§08)', () => {
  it('gives intervals for an Intensity session and focus cues in the athlete’s language', () => {
    const h = howToFor({ type: 'Intensity', sport: 'run', durationMinutes: 60, zone: 'Z4' }, 'da')!;
    expect(h.segments.some((x) => x.zone === 'Z4')).toBe(true);
    expect(h.focus.length).toBeGreaterThanOrEqual(2);
    expect(h.focus[0]).toMatch(/opvarmningen/);
  });

  it('rests a short Intensity rep a full two minutes, and spends what the set leaves steady first (§08, Hvem gør hvad)', () => {
    // 60 min: 10 warm-up, 5 cool-down, 45 main. Ten 1-minute run reps (the
    // most §08 has) with 2 min rest take 10 + 9 × 2 = 28 min; 17 go steady in Z2.
    const h = howToFor({ type: 'Intensity', sport: 'run', durationMinutes: 60, zone: 'Z4' }, 'en')!;
    expect(h.segments).toEqual([
      { name: 'warmUp', minutes: 10, zone: 'Z2', detail: null },
      { name: 'steady', minutes: 17, zone: 'Z2', detail: null },
      { name: 'main', minutes: 28, zone: 'Z4', detail: '10 × 1 min, 2 min Z1 between (full recovery)' },
      { name: 'coolDown', minutes: 5, zone: 'Z2', detail: null },
    ]);
  });

  it('rests a long Intensity rep no longer than the work, and fits as many reps as the main part holds', () => {
    // 30 min: 5 + 3 around a 22-minute main; 3-minute bike reps with 3 min
    // rest: (22 × 60 + 180) / 360 = 4.2 → 4 reps, 12 + 3 × 3 = 21 min.
    const h = howToFor({ type: 'Intensity', sport: 'bike', durationMinutes: 30, zone: 'Z4' }, 'da')!;
    expect(h.segments.map((x) => [x.name, x.minutes])).toEqual([
      ['warmUp', 5],
      ['steady', 1],
      ['main', 21],
      ['coolDown', 3],
    ]);
    expect(h.segments[2].detail).toBe('4 × 3 min, 3 min Z1 imellem');
  });

  it('rests by rep length: under two minutes a fixed full recovery, from two minutes at most the work', () => {
    expect(INTENSITY_REST(60)).toEqual({ seconds: 120, fullRecovery: true });
    expect(INTENSITY_REST(119)).toEqual({ seconds: 120, fullRecovery: true });
    expect(INTENSITY_REST(120)).toEqual({ seconds: 120, fullRecovery: false });
    expect(INTENSITY_REST(180)).toEqual({ seconds: 180, fullRecovery: false });
    expect(howToFor({ type: 'Intensity', sport: 'run', durationMinutes: 30, zone: 'Z4' }, 'da')!.segments.find((x) => x.name === 'main')!.detail).toMatch(
      /2 min Z1 imellem \(fuld restitution\)$/,
    );
  });

  it('shortens a short bike Intensity session’s reps inside §08’s range, keeping the rep count and the rest rule', () => {
    // 25 min bike: 17 min main. Four 3-minute reps with 3 min rest need 21, so
    // the rep drops to 2 min (§08: 30 s – 5 min), resting as long as it worked:
    // 4 × 2 + 3 × 2 = 14 min, 3 steady before it.
    const h = howToFor({ type: 'Intensity', sport: 'bike', durationMinutes: 25, zone: 'Z4' }, 'en')!;
    expect(h.segments).toEqual([
      { name: 'warmUp', minutes: 5, zone: 'Z2', detail: null },
      { name: 'steady', minutes: 3, zone: 'Z2', detail: null },
      { name: 'main', minutes: 14, zone: 'Z4', detail: '4 × 2 min, 2 min Z1 between' },
      { name: 'coolDown', minutes: 3, zone: 'Z2', detail: null },
    ]);
    // 20 min: 12 main. A 2-minute rep needs 14; a 1-minute rep rests the full two minutes (Hvem gør hvad): 4 + 6 = 10.
    const shorter = howToFor({ type: 'Intensity', sport: 'bike', durationMinutes: 20, zone: 'Z4' }, 'da')!;
    expect(shorter.segments.find((x) => x.name === 'main')).toEqual({
      name: 'main',
      minutes: 10,
      zone: 'Z4',
      detail: '4 × 1 min, 2 min Z1 imellem (fuld restitution)',
    });
    expect(sum(shorter.segments)).toBe(20);
  });

  it('shortens a Tempo rep a minute at a time down to 5 min on the bike, the floor of §08’s 5–30 min', () => {
    const main = (d: number) => howToFor({ type: 'Tempo', sport: 'bike', durationMinutes: d, zone: null }, 'en')!.segments.find((x) => x.name === 'main')!;
    // Tempo, 22 min: 14 main. Two 10-minute reps need 22.5; 7 min reps with 105 s rest take 15.75 → too long;
    // 6 min with 90 s take 13.5 → 14.
    expect(main(22)).toEqual({ name: 'main', minutes: 14, zone: 'Z3', detail: '2 × 6 min, 90 s Z1 between' });
    // Tempo, 20 min: 12 main. Two 5-minute reps with 75 s rest take 11.25 → 12, the floor of §08's 5–30 min.
    expect(main(20)).toEqual({ name: 'main', minutes: 12, zone: 'Z3', detail: '2 × 5 min, 75 s Z1 between' });
  });

  it('shows no main-set detail when even the shortest rep at the fewest reps does not fit, only its zone in words', () => {
    // An Intensity brick at 60 min: 45 main, and two bike-then-run reps need 50.5.
    const brick = howToFor({ type: 'Intensity', sport: 'brick', durationMinutes: 60, zone: 'Z4' }, 'en')!;
    expect(brick.segments).toEqual([
      { name: 'warmUp', minutes: 10, zone: 'Z2', detail: null },
      { name: 'main', minutes: 45, zone: 'Z4', detail: 'The main part at Z4. No set of repeats is given for this session.' },
      { name: 'coolDown', minutes: 5, zone: 'Z2', detail: null },
    ]);
    // Under 20 minutes there is no warm-up to hold a set after, so the same line stands alone.
    const short = howToFor({ type: 'Tempo', sport: 'run', durationMinutes: 15, zone: 'Z3' }, 'da')!;
    expect(short.segments).toEqual([
      { name: 'main', minutes: 15, zone: 'Z3', detail: 'Hoveddelen i Z3. Der er ikke angivet et sæt gentagelser for denne session.' },
    ]);
  });

  it('rests a quarter of the work between tempo reps, in seconds when it is not whole minutes', () => {
    // Bike tempo, 75 min: 10 + 5 around 60; reps of 10 min with 150 s rest →
    // (3600 + 150) / 750 = 5 reps, 50 min + 4 × 150 s = 60 min exactly.
    const bike = howToFor({ type: 'Tempo', sport: 'bike', durationMinutes: 75, zone: 'Z3' }, 'en')!;
    expect(bike.segments.map((x) => [x.name, x.minutes])).toEqual([
      ['warmUp', 10],
      ['main', 60],
      ['coolDown', 5],
    ]);
    expect(bike.segments[1].detail).toBe('5 × 10 min, 150 s Z1 between');
    const run = howToFor({ type: 'Tempo', sport: 'run', durationMinutes: 40, zone: 'Z3' }, 'en')!;
    // 32 min main; 8 min reps with 2 min rest → 3 reps: 24 + 4 = 28 min, 4 steady.
    expect(run.segments.find((x) => x.name === 'main')!.detail).toBe('3 × 8 min, 2 min Z1 between');
    expect(sum(run.segments)).toBe(40);
  });

  it('caps the reps at the most §08 allows and rounds a part-minute of work up into the set', () => {
    // Bike tempo, 180 min: 160 main; 8 reps (the max) take 80 + 7 × 2.5 = 97.5 → 98 min.
    const h = howToFor({ type: 'Tempo', sport: 'bike', durationMinutes: 180, zone: 'Z3' }, 'en')!;
    expect(h.segments.map((x) => [x.name, x.minutes])).toEqual([
      ['warmUp', 15],
      ['steady', 62],
      ['main', 98],
      ['coolDown', 5],
    ]);
  });

  it('repeats a swim distance through the main part, with its range, and gives the warm-up in metres', () => {
    const h = howToFor({ type: 'Intensity', sport: 'swim', durationMinutes: 45, zone: 'Z4' }, 'en')!;
    expect(h.segments).toEqual([
      { name: 'warmUp', minutes: 10, zone: 'Z2', detail: '150–250 m' },
      { name: 'main', minutes: 30, zone: 'Z4', detail: '100 m, 20 s rest, repeated until the time is up (4–20 reps)' },
      { name: 'coolDown', minutes: 5, zone: 'Z2', detail: '~100 m' },
    ]);
    const da = howToFor({ type: 'Tempo', sport: 'swim', durationMinutes: 45, zone: 'Z3' }, 'da')!;
    expect(da.segments[1].detail).toBe('300 m, 15 s pause, gentaget til tiden er gået (2–8 gange)');
  });

  it('builds a brick from bike-then-run repeats with a short transition, a long ride first when there is time', () => {
    // 180 min long brick: 160 main. Four reps take 4 × 23 min + 7 × 90 s = 102.5 → 103; 57 ridden first.
    const h = howToFor({ type: 'Endurance', sport: 'brick', durationMinutes: 180, zone: 'Z2' }, 'en')!;
    expect(h.segments).toEqual([
      { name: 'warmUp', minutes: 15, zone: 'Z2', detail: null },
      { name: 'steady', minutes: 57, zone: 'Z2', detail: null },
      { name: 'main', minutes: 103, zone: 'Z2', detail: '4 × (15 min bike + 8 min run), 90 s transition' },
      { name: 'coolDown', minutes: 5, zone: 'Z2', detail: null },
    ]);
    const short = howToFor({ type: 'Intensity', sport: 'brick', durationMinutes: 75, zone: 'Z4' }, 'da')!;
    // 60 main: two reps take 46 min + 3 × 90 s = 50.5 → 51.
    expect(short.segments.find((x) => x.name === 'main')).toEqual({
      name: 'main',
      minutes: 51,
      zone: 'Z4',
      detail: '2 × (15 min cykel + 8 min løb), 90 s skift',
    });
    const tooShort = howToFor({ type: 'Endurance', sport: 'brick', durationMinutes: 60, zone: 'Z2' }, 'en')!;
    expect(tooShort.segments.find((x) => x.name === 'main')!.detail).toBeNull();
  });

  it('falls back to the type’s sport-neutral entry for an unknown or missing sport', () => {
    const h = howToFor({ type: 'Endurance', sport: 'cycling', durationMinutes: 60, zone: 'Z2' }, 'en')!;
    expect(h.segments[1]).toEqual({ name: 'main', minutes: 45, zone: 'Z2', detail: null });
  });

  it('gives the sport-neutral Intensity and Tempo sessions no set, since §08 has no row without a sport', () => {
    const intensity = howToFor({ type: 'Intensity', sport: null, durationMinutes: 60, zone: 'Z4' }, 'en')!;
    expect(names(intensity)).toEqual(['warmUp', 'main', 'coolDown']);
    expect(intensity.segments[1]).toEqual({
      name: 'main',
      minutes: 45,
      zone: 'Z4',
      detail: 'The main part at Z4. No set of repeats is given for this session.',
    });
    const tempo = howToFor({ type: 'Tempo', sport: 'cycling', durationMinutes: 90, zone: 'Z3' }, 'da')!;
    expect(tempo.segments.map((x) => [x.name, x.minutes])).toEqual([
      ['warmUp', 15],
      ['main', 70],
      ['coolDown', 5],
    ]);
    expect(tempo.segments[1].detail).toBe('Hoveddelen i Z3. Der er ikke angivet et sæt gentagelser for denne session.');
  });

  it('never shows an Intensity or Tempo main part as a bare block at its zone, at any length or sport', () => {
    for (const type of ['Intensity', 'Tempo']) {
      for (const sport of [...HOW_TO_SPORTS, null]) {
        for (const d of [15, 20, 25, 30, 45, 60, 90, 180]) {
          const h = howToFor({ type, sport, durationMinutes: d, zone: null }, 'en')!;
          expect(h.segments.find((x) => x.name === 'main')!.detail).toBeTruthy();
          expect(sum(h.segments)).toBe(d);
        }
      }
    }
  });
});

describe('howToFor — the focus cues', () => {
  it('adds the fuelling cue to an Endurance session over an hour, and not at an hour', () => {
    const over = howToFor({ type: 'Endurance', sport: 'run', durationMinutes: 61, zone: 'Z2' }, 'en')!;
    expect(over.focus).toHaveLength(3);
    expect(over.focus[2]).toBe(FUELLING_CUE.en);
    const hour = howToFor({ type: 'Endurance', sport: 'run', durationMinutes: 60, zone: 'Z2' }, 'da')!;
    expect(hour.focus).toHaveLength(2);
    expect(hour.focus).not.toContain(FUELLING_CUE.da);
  });

  it('never adds it to a swim', () => {
    expect(howToFor({ type: 'Endurance', sport: 'swim', durationMinutes: 90, zone: 'Z2' }, 'en')!.focus).toHaveLength(2);
  });
});

describe('the template library (E7)', () => {
  it('every template has a source, both languages, and 2–3 cues', () => {
    for (const t of HOW_TO_TEMPLATES) {
      expect(t.source).toBeTruthy();
      expect(t.focus.length).toBeGreaterThanOrEqual(2);
      expect(t.focus.length + (t.fuelling ? 1 : 0)).toBeLessThanOrEqual(3);
      for (const cue of t.focus) {
        expect(cue.en.trim()).not.toBe('');
        expect(cue.da.trim()).not.toBe('');
      }
    }
  });

  it('has one entry per type and sport, and a sport-neutral entry for every type', () => {
    const keys = HOW_TO_TEMPLATES.map((t) => `${t.type}/${t.sport}`);
    expect(keys.sort()).toEqual([
      'Endurance/any',
      'Endurance/brick',
      'Endurance/swim',
      'Intensity/any',
      'Intensity/bike',
      'Intensity/brick',
      'Intensity/run',
      'Intensity/swim',
      'Recovery/any',
      'Tempo/any',
      'Tempo/bike',
      'Tempo/brick',
      'Tempo/run',
      'Tempo/swim',
    ]);
  });

  it('fits every entry, at every length, to segments that add up and zones in the allowed set', () => {
    for (const t of HOW_TO_TEMPLATES) {
      for (const sport of [...HOW_TO_SPORTS, null]) {
        for (const d of [15, 20, 30, 45, 60, 75, 90, 120, 180, 300]) {
          const h = howToFor({ type: t.type, sport: t.sport === 'any' ? sport : t.sport, durationMinutes: d, zone: null }, 'en')!;
          expect(sum(h.segments)).toBe(d);
          for (const x of h.segments) {
            expect(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']).toContain(x.zone);
            expect(x.minutes).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('gives each sport-specific entry to a session of that sport', () => {
    for (const t of HOW_TO_TEMPLATES.filter((x) => x.sport !== 'any')) {
      const h = howToFor({ type: t.type, sport: t.sport, durationMinutes: 45, zone: null }, 'en')!;
      expect(h.focus).toEqual(t.focus.map((cue) => cue.en));
    }
  });

  it('adds the fuelling cue only to Endurance on land, the one place its source reaches', () => {
    const fuelled = HOW_TO_TEMPLATES.filter((t) => t.fuelling).map((t) => `${t.type}/${t.sport}`);
    expect(fuelled.sort()).toEqual(['Endurance/any', 'Endurance/brick']);
    expect(FUELLING_CUE.en).toMatch(/race day/);
    expect(FUELLING_CUE.da).toMatch(/konkurrencedagen/);
  });

  it('is unreviewed until Mads has read it', () => {
    expect(HOW_TO_TEMPLATES.every((t) => t.reviewed === false)).toBe(true);
  });
});

describe('howToOf — which sessions, and whose text', () => {
  it('gives no how-to for athlete, head-coach-created or imported sessions', () => {
    for (const origin of ['athlete', 'head_coach', 'garmin'] as const) expect(howToOf(s({ origin }), 'en')).toBeNull();
  });

  it('gives the template how-to for the arithmetic’s and Momentum’s sessions, with no cue of Momentum’s', () => {
    for (const origin of ['arithmetic', 'coach'] as const) {
      const h = howToOf(s({ origin }), 'en')!;
      expect(h.byCoach).toBe(false);
      expect(h.cue).toBeNull();
      expect(sum(h.segments)).toBe(90);
    }
  });

  it('carries Momentum’s one cue beside the template', () => {
    const h = howToOf(s({ origin: 'coach', howTo: { cue: 'Spin light, spare the knee.' } }), 'en')!;
    expect(h.cue).toBe('Spin light, spare the knee.');
    expect(h.focus).toEqual(howToFor({ type: 'Endurance', sport: 'bike', durationMinutes: 90, zone: 'Z2' }, 'en')!.focus);
  });

  it('uses the coach’s text as final and refits the template after a coach duration change', () => {
    const coached = howToOf(s({ howTo: { coach: COACH }, duration: 45 }), 'en')!;
    expect(coached.segments).toEqual(COACH.segments);
    expect(coached.focus).toEqual(COACH.focus);
    expect(coached.byCoach).toBe(true);
    expect(coached.cue).toBeNull();
    expect(sum(howToOf(s({ duration: 45 }), 'en')!.segments)).toBe(45);
  });

  it('refits only the session that changed', () => {
    const a = s();
    const b = s({ type: 'Tempo', sport: 'run', zone: 'Z3' });
    const before = howToOf(b, 'en');
    howToOf({ ...a, duration: 60 }, 'en');
    expect(howToOf(b, 'en')).toEqual(before);
    expect(howToOf({ ...a, duration: 60 }, 'en')).not.toEqual(howToOf(a, 'en'));
  });

  it('has none for a session with no minutes', () => {
    expect(howToOf(s({ duration: null }), 'en')).toBeNull();
  });
});

describe('cueFrom — Momentum’s one personal cue', () => {
  it('keeps one trimmed sentence of up to 140 characters', () => {
    expect(cueFrom('  Spin light, spare the knee.  ')).toBe('Spin light, spare the knee.');
    expect(cueFrom('x'.repeat(140))).toBe('x'.repeat(140));
  });

  it('drops a cue that is too long, blank, several sentences, or carries an identifier', () => {
    expect(cueFrom('x'.repeat(141))).toBeNull();
    expect(cueFrom('   ')).toBeNull();
    expect(cueFrom(7)).toBeNull();
    expect(cueFrom('Easy today. Hard tomorrow.')).toBeNull();
    expect(cueFrom('Easy today!\nHard tomorrow')).toBeNull();
    expect(cueFrom('Ask me at coach@example.com')).toBeNull();
    expect(cueFrom('Call 12345678 after')).toBeNull();
    expect(cueFrom('Easy today.  Hard tomorrow')).toBeNull();
  });

  it('allows a full stop inside a number or at the very end', () => {
    expect(cueFrom('Hold 2.5 W/kg on the climbs.')).toBe('Hold 2.5 W/kg on the climbs.');
  });
});

describe('coachHowToFrom — the Head Coach’s edited how-to', () => {
  it('keeps segments that add up to the session’s minutes, with zones in the set, and trimmed cues', () => {
    expect(coachHowToFrom({ ...COACH, focus: ['  Stay seated on the climbs ', ''] }, 90)).toEqual(COACH);
  });

  it('refuses segments that do not add up, an unknown segment or zone, or no segments', () => {
    expect(coachHowToFrom(COACH, 80)).toBeNull();
    expect(coachHowToFrom(COACH, null)).toBeNull();
    expect(coachHowToFrom({ ...COACH, segments: [{ ...COACH.segments[0], name: 'sprint' }, ...COACH.segments.slice(1)] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, segments: [{ ...COACH.segments[0], zone: 'Z9' }, ...COACH.segments.slice(1)] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, segments: [{ ...COACH.segments[0], minutes: 0 }, { ...COACH.segments[1], minutes: 80 }, COACH.segments[2]] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, segments: [{ ...COACH.segments[0], minutes: 19.5 }, { ...COACH.segments[1], minutes: 60.5 }, COACH.segments[2]] }, 90)).toBeNull();
    expect(coachHowToFrom({ segments: [], focus: [] }, 0)).toBeNull();
    expect(coachHowToFrom({ focus: [] }, 90)).toBeNull();
    expect(coachHowToFrom(null, 90)).toBeNull();
    expect(coachHowToFrom([COACH.segments[0]], 20)).toBeNull();
    expect(coachHowToFrom({ ...COACH, segments: [null, ...COACH.segments] }, 90)).toBeNull();
  });

  it('refuses text that carries an identifier or runs too long, since it can reach a prompt', () => {
    expect(coachHowToFrom({ ...COACH, focus: ['mail me: a@b.dk'] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, focus: ['x'.repeat(201)] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, focus: [7] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, focus: ['fine', 'mail me: a@b.dk'] }, 90)).toBeNull();
    expect(coachHowToFrom({ ...COACH, focus: ['x'.repeat(200)] }, 90)!.focus).toEqual(['x'.repeat(200)]);
    expect(coachHowToFrom({ ...COACH, focus: 'one' }, 90)).toBeNull();
    const segments = COACH.segments.map((x, i) => (i === 1 ? { ...x, detail: 'x'.repeat(201) } : x));
    expect(coachHowToFrom({ ...COACH, segments }, 90)).toBeNull();
    const phone = COACH.segments.map((x, i) => (i === 1 ? { ...x, detail: '+45 12 34 56 78' } : x));
    expect(coachHowToFrom({ ...COACH, segments: phone }, 90)).toBeNull();
  });

  it('keeps at most five cues and reads a blank detail as none', () => {
    const many = coachHowToFrom({ ...COACH, focus: ['a', 'b', 'c', 'd', 'e', 'f'] }, 90)!;
    expect(many.focus).toEqual(['a', 'b', 'c', 'd', 'e']);
    const blank = COACH.segments.map((x) => ({ ...x, detail: '  ' }));
    expect(coachHowToFrom({ ...COACH, segments: blank }, 90)!.segments.every((x) => x.detail === null)).toBe(true);
  });
});

describe('storedHowToFrom — the stored column', () => {
  it('reads the cue and the coach’s how-to, each only when valid', () => {
    expect(storedHowToFrom({ cue: 'Easy spin.', coach: COACH })).toEqual({ cue: 'Easy spin.', coach: COACH });
    expect(storedHowToFrom({ cue: 'Easy spin.' })).toEqual({ cue: 'Easy spin.' });
    expect(storedHowToFrom({ coach: COACH })).toEqual({ coach: COACH });
  });

  it('is nothing for a missing, empty or malformed value', () => {
    expect(storedHowToFrom(null)).toBeNull();
    expect(storedHowToFrom('x')).toBeNull();
    expect(storedHowToFrom({})).toBeNull();
    expect(storedHowToFrom({ cue: 7, coach: { segments: 'no' } })).toBeNull();
    expect(storedHowToFrom({ cue: 'Easy spin.', coach: { focus: [] } })).toEqual({ cue: 'Easy spin.' });
  });
});
