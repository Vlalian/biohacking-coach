import { describe, it, expect } from 'vitest';
import { parseSeedArgs } from './seed-personas';

/**
 * The seed's flag, parsed where a test can reach it (code-health/16).
 *
 * `--with-personas` is off by default, and that default is the whole point:
 * `test/e2e`'s page baselines and the dry dev seed depend on a Roster of one.
 */
describe('parseSeedArgs', () => {
  it('seeds no persona unless asked', () => {
    expect(parseSeedArgs([])).toEqual({ withPersonas: false });
  });

  it('seeds the personas on --with-personas', () => {
    expect(parseSeedArgs(['--with-personas'])).toEqual({ withPersonas: true });
  });

  it('leaves --production to the database guard rather than refusing it', () => {
    // PR #83's guard reads `--production` off the same argv; this parser must
    // not treat the other script's flag as a typo.
    expect(parseSeedArgs(['--production'])).toEqual({ withPersonas: false });
    expect(parseSeedArgs(['--with-personas', '--production'])).toEqual({ withPersonas: true });
  });

  it('refuses anything else, naming it', () => {
    expect(parseSeedArgs(['--with-persona'])).toEqual({ error: 'unknown argument: --with-persona' });
    expect(parseSeedArgs(['--with-personas', 'extra'])).toEqual({ error: 'unknown argument: extra' });
  });
});
