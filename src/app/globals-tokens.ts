/**
 * The theme tokens of `globals.css`, read as numbers (`showable-version/38`).
 *
 * `globals.css` is the only source of the palette; this module lets a test
 * measure it. It parses the two theme blocks (`:root` for light, `.dark` for
 * dark) into oklch values, converts oklch to sRGB the way a browser does, and
 * computes WCAG 2.x contrast — so the contrast bar the palette was chosen
 * against (AA: text 4.5, control edges 3.0; muted text 7.0 by Mads's ruling,
 * 2026-09-19) is something the suite checks rather than something a token edit
 * can quietly undo.
 *
 * No colour library: the conversion is Björn Ottosson's published OKLab
 * matrices, a dozen lines, and the known-value tests beside this file pin them.
 */

export interface Oklch {
  L: number;
  C: number;
  h: number;
  /** 1 when the token is opaque; a fraction for `oklch(… / 10%)` washes. */
  alpha: number;
}

export type Theme = Record<string, Oklch>;

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/;

/** The custom properties declared as `oklch(...)` inside one `{ … }` block. */
function tokensIn(block: string): Theme {
  const theme: Theme = {};
  // The regex owns the whitespace, so the value needs no trim: one mechanism,
  // or a mutant that breaks either one hides behind the other.
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]*?)\s*;/g)) {
    const m = OKLCH.exec(value);
    if (!m) continue;
    const [, L, C, h, a, pct] = m;
    const alpha = a === undefined ? 1 : pct ? Number(a) / 100 : Number(a);
    theme[name] = { L: Number(L), C: Number(C), h: Number(h), alpha };
  }
  return theme;
}

/** The body of the first `selector { … }` block in the stylesheet. */
export function blockOf(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`globals.css has no "${selector}" block`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/** Light is `:root`, dark is the `.dark` class next-themes sets on `<html>`. */
export function parseThemes(css: string): { light: Theme; dark: Theme } {
  return { light: tokensIn(blockOf(css, ':root')), dark: tokensIn(blockOf(css, '.dark')) };
}

/** oklch → linear sRGB, clamped to the gamut. Returns [r, g, b] in 0..1. */
export function oklchToLinearSrgb({ L, C, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** `#rrggbb` → linear sRGB. */
export function hexToLinearSrgb(hex: string): [number, number, number] {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    // Stryker disable next-line EqualityOperator — `<=` vs `<` differ only at c = 0.04045 exactly, which no k/255 value is; the two branches also meet there by construction.
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

/** WCAG relative luminance of a linear sRGB colour. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The colour as it renders: an alpha wash composited over the background. */
function composite(fg: Oklch, bg: Oklch): [number, number, number] {
  const f = oklchToLinearSrgb(fg);
  const b = oklchToLinearSrgb(bg);
  return [0, 1, 2].map((i) => f[i] * fg.alpha + b[i] * (1 - fg.alpha)) as [number, number, number];
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.x contrast of a token over an opaque background token. */
export function contrast(fg: Oklch, bg: Oklch): number {
  return ratio(composite(fg, bg), oklchToLinearSrgb(bg));
}

/** WCAG 2.x contrast of a hex literal over a background token. */
export function contrastHex(hex: string, bg: Oklch): number {
  return ratio(hexToLinearSrgb(hex), oklchToLinearSrgb(bg));
}
