import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * showable-version/63: the four committed pictures are PNGs at the size of the
 * viewport they were taken in, each under 400 kB. Refresh them with
 * `npm run frontpage:screenshots`.
 */
const pictures = [
  ['roster-view.png', 1440, 900],
  ['coach-chat.png', 390, 844],
  ['training-plan.png', 1440, 900],
  ['information-view.png', 1440, 900],
] as const;

describe('frontpage pictures', () => {
  it.each(pictures)('%s is a %sx%s PNG under 400 kB', (file, width, height) => {
    const bytes = readFileSync(new URL(`../public/frontpage/${file}`, import.meta.url));
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(width);
    expect(bytes.readUInt32BE(20)).toBe(height);
    expect(bytes.length).toBeLessThan(400_000);
  });
});
