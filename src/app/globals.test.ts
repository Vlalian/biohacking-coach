import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { blockOf, contrast, contrastHex, hexToLinearSrgb, oklchToLinearSrgb, parseThemes } from './globals-tokens';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';

/**
 * `showable-version/38`: the Warm palette holds WCAG AA on both backgrounds,
 * and this file is what keeps it held. The tokens are measured from
 * `globals.css` itself — not from a copy of the numbers — so a token edit that
 * drops a ratio fails here before it reaches a preview.
 */
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('parseThemes — the tokens as globals.css declares them', () => {
  it('parses --background and --border for light and dark, alpha included', () => {
    const t = parseThemes(css);
    expect(t.light['--background']).toEqual({ L: 0.975, C: 0.002, h: 260, alpha: 1 });
    expect(t.dark['--background']).toEqual({ L: 0.12, C: 0.006, h: 260, alpha: 1 });
    expect(Object.keys(t.light)).toContain('--muted-foreground');
  });
});

describe('parseThemes — the shapes a token can take', () => {
  const sample = [
    ':root {',
    '  --radius: 0.5rem;',
    '  --wash: oklch(0.16 0.01 60 / 10%);',
    '  --half: oklch(0.2 0 0 / 0.5);',
    '  --plain: oklch(0.5 0.1 20);',
    '}',
    '.dark {',
    '  --plain: oklch(1 0 0);',
    '}',
  ].join('\n');

  it('reads a percentage alpha, a fractional alpha and none; skips a non-oklch value', () => {
    const { light, dark } = parseThemes(sample);
    expect(light['--wash']).toEqual({ L: 0.16, C: 0.01, h: 60, alpha: 0.1 });
    expect(light['--half']).toEqual({ L: 0.2, C: 0, h: 0, alpha: 0.5 });
    expect(light['--plain']).toEqual({ L: 0.5, C: 0.1, h: 20, alpha: 1 });
    expect(light).not.toHaveProperty('--radius');
    expect(dark).toEqual({ '--plain': { L: 1, C: 0, h: 0, alpha: 1 } });
  });

  it('is indifferent to spacing: none, several, tabs, and around the slash', () => {
    const { light } = parseThemes(
      [
        ':root {',
        '--a:oklch(1 0 0);',
        '--b :  oklch( 0.5  0.1 \t 20 );',
        '--c: oklch(0.2 0 0/0.5) ;',
        '--d: oklch(0.2 0 0 /10%);',
        '--e: oklch(0.2 0 0 / 10% );',
        '}',
        '.dark {',
        '}',
      ].join('\n'),
    );
    expect(light['--a']).toEqual({ L: 1, C: 0, h: 0, alpha: 1 });
    expect(light['--b']).toEqual({ L: 0.5, C: 0.1, h: 20, alpha: 1 });
    expect(light['--c']).toEqual({ L: 0.2, C: 0, h: 0, alpha: 0.5 });
    expect(light['--d']).toEqual({ L: 0.2, C: 0, h: 0, alpha: 0.1 });
    expect(light['--e']).toEqual({ L: 0.2, C: 0, h: 0, alpha: 0.1 });
  });

  it('does not read a value that is not exactly an oklch() call', () => {
    const { light } = parseThemes(
      [':root {', '--two: oklch(0.5 0.1);', '--commas: oklch(0.5, 0.1, 20);', '--tail: oklch(1 0 0) !important;', '--head: x oklch(1 0 0);', '}', '.dark {', '}'].join('\n'),
    );
    expect(light).toEqual({});
  });

  it('blockOf returns exactly the body of the named block, not the one before it', () => {
    expect(blockOf('a { x } .b { y }', '.b')).toBe(' y ');
    expect(blockOf(':root {\n  --a: 1;\n}', ':root')).toBe('\n  --a: 1;\n');
  });

  it('refuses a stylesheet with no dark block, naming the selector', () => {
    expect(() => parseThemes(':root { --a: oklch(1 0 0); }')).toThrow('globals.css has no ".dark" block');
  });
});

describe('oklch → linear sRGB — the primaries land where the standard puts them', () => {
  // Reference points from the OKLab spec: the sRGB primaries expressed in oklch.
  it.each([
    ['red', { L: 0.6279, C: 0.2577, h: 29.23 }, [1, 0, 0]],
    ['green', { L: 0.8664, C: 0.2948, h: 142.5 }, [0, 1, 0]],
    ['blue', { L: 0.452, C: 0.3132, h: 264.05 }, [0, 0, 1]],
    // OKLab lightness is a cube root: L 0.5 is linear 0.125, not sRGB #808080.
    ['mid grey', { L: 0.5, C: 0, h: 0 }, [0.125, 0.125, 0.125]],
  ] as const)('%s', (_, oklch, linear) => {
    const got = oklchToLinearSrgb({ ...oklch, alpha: 1 });
    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(linear[i], 2);
  });

  it('decodes a hex literal through the sRGB curve, both branches', () => {
    const [r, g, b] = hexToLinearSrgb('#808080');
    expect(r).toBeCloseTo(0.2159, 3);
    expect(g).toBeCloseTo(0.2159, 3);
    expect(b).toBeCloseTo(0.2159, 3);
    // 1/255 sits far under the 0.04045 knee: the linear branch (0.000304),
    // not the curve (0.00099). Near the knee the two agree to five decimals,
    // which is what makes the curve continuous and a knee-adjacent value useless here.
    expect(hexToLinearSrgb('#010101')[0]).toBeCloseTo(1 / 255 / 12.92, 6);
    expect(hexToLinearSrgb('#0b0b0b')[0]).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 5);
  });
});

describe('contrast — the WCAG 2.x maths on known values', () => {
  it('converts oklch white/black and computes 21:1 between them', () => {
    const white = { L: 1, C: 0, h: 0, alpha: 1 };
    const black = { L: 0, C: 0, h: 0, alpha: 1 };
    expect(contrast(white, black)).toBeCloseTo(21, 3);
    // Symmetric: the lighter colour is always the numerator.
    expect(contrast(black, white)).toBeCloseTo(21, 3);
    // Mid grey (linear 0.125) on white: (1.05) / (0.175) = 6.
    expect(contrast({ L: 0.5, C: 0, h: 0, alpha: 1 }, white)).toBeCloseTo(6, 3);
    // The foreground on the light background, as measured on 2026-09-19.
    expect(contrast({ L: 0.16, C: 0.01, h: 60, alpha: 1 }, { L: 0.985, C: 0.005, h: 85, alpha: 1 })).toBeCloseTo(18.61, 1);
  });

  it('composites an alpha colour over the background before measuring', () => {
    // Black at 10 % over white renders as linear 0.9: (1.05) / (0.95).
    expect(contrast({ L: 0, C: 0, h: 0, alpha: 0.1 }, { L: 1, C: 0, h: 0, alpha: 1 })).toBeCloseTo(1.05 / 0.95, 3);
    // At alpha 1 the composite is the colour itself.
    expect(contrast({ L: 0, C: 0, h: 0, alpha: 1 }, { L: 1, C: 0, h: 0, alpha: 1 })).toBeCloseTo(21, 3);
  });

  it('measures a hex literal the same way', () => {
    expect(contrastHex('#ffffff', { L: 0, C: 0, h: 0, alpha: 1 })).toBeCloseTo(21, 3);
    expect(contrastHex('#808080', { L: 1, C: 0, h: 0, alpha: 1 })).toBeCloseTo(1.05 / 0.2659, 2);
  });
});

/**
 * The bar (Mads, 2026-09-19): WCAG AA — text ≥ 4.5, every control edge ≥ 3.0;
 * muted text ≥ 7.0 because the 13 px muted line at 7.1 was still hard to read.
 */
describe.each(['light', 'dark'] as const)('%s theme holds the contrast bar', (theme) => {
  // Parsed inside each test, not at collection: a parser that breaks must fail
  // a test, or the mutation gate cannot see it fail.
  const tokens = () => parseThemes(css)[theme];

  it.each(['--foreground', '--signal', '--accent-signal', '--warning', '--destructive'])(
    '%s on the background is at least 4.5',
    (name) => {
      const t = tokens();
      expect(contrast(t[name], t['--background'])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('--muted-foreground on the background and on a card is at least 7.0', () => {
    const t = tokens();
    expect(contrast(t['--muted-foreground'], t['--background'])).toBeGreaterThanOrEqual(7);
    expect(contrast(t['--muted-foreground'], t['--card'])).toBeGreaterThanOrEqual(7);
  });

  it.each(['--border', '--input', '--ring', '--sidebar-border'])('%s is opaque and at least 3.0 on background and card', (name) => {
    const t = tokens();
    expect(t[name].alpha).toBe(1);
    expect(contrast(t[name], t['--background'])).toBeGreaterThanOrEqual(3);
    expect(contrast(t[name], t['--card'])).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries({ ...TYPE_COLORS, default: DEFAULT_TYPE_COLOR }))(
    'session colour %s %s is at least 3.0 on the background',
    (_, hex) => {
      expect(contrastHex(hex, tokens()['--background'])).toBeGreaterThanOrEqual(3);
    },
  );
});

/**
 * A muted token that measures 7 : 1 is undone by `text-muted-foreground/60`
 * on the element. Text takes the token's contrast as it is; alpha stays for
 * scrims and card accents, which are not text.
 */
describe('no component lowers text contrast with an opacity modifier', () => {
  // From this file, never `process.cwd()`: the mutation gate runs the suite
  // from a sandbox copy elsewhere (see `session-chip-naming.test.ts`).
  const SRC = fileURLToPath(new URL('..', import.meta.url));
  const TEXT_ALPHA = /\b(?:placeholder:)?text-(?:muted-foreground|foreground)\/\d+\b/g;

  // Components only (`.tsx`), snapshot folders skipped: the class strings live
  // in markup, and a whole-tree read under coverage instrumentation is what
  // pushes the repo's scan tests past their timeout on a loaded machine.
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__snapshots__' ? [] : sourceFiles(full);
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
    });
  }

  /** `path:line: class` for every offending class in `src/`, sorted. */
  function offenders(): string[] {
    return sourceFiles(SRC)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) =>
            [...line.matchAll(TEXT_ALPHA)].map(
              (m) => `${file.slice(SRC.length).split(sep).join('/')}:${i + 1}: ${m[0]}`,
            ),
          ),
      )
      .sort();
  }

  it('finds none', () => {
    expect(offenders()).toEqual([]);
  });
});
