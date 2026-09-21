import { describe, it, expect } from 'vitest';
import { resetBranchToParent, type NeonRunner } from './neon-reset-branch';

/**
 * The page suite resets its Neon branch to its parent before reseeding
 * (frontend-quality/08). The CLI is the port; these tests drive the module
 * with a fake so no branch is touched.
 */
function fakeNeon(replies: Record<string, string | Error>): { run: NeonRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: NeonRunner = (args) => {
    calls.push(args);
    const reply = replies[args.join(' ')];
    if (reply === undefined) throw new Error(`unexpected neon call: ${args.join(' ')}`);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { run, calls };
}

const branchJson = JSON.stringify({ id: 'br-child', parent_id: 'br-parent', name: 'test/e2e' });
const parentJson = JSON.stringify({ id: 'br-parent', name: 'seed-template' });

describe('resetBranchToParent', () => {
  it('resets the branch to its parent and names the parent it landed on', () => {
    const neon = fakeNeon({
      '--version': '4.17.1\n',
      'branches reset test/e2e --parent -o json': branchJson,
      'branches get br-parent -o json': parentJson,
    });

    expect(resetBranchToParent('test/e2e', neon.run)).toEqual({
      branch: 'test/e2e',
      branchId: 'br-child',
      parentId: 'br-parent',
      parentName: 'seed-template',
    });
    expect(neon.calls).toEqual([
      ['--version'],
      ['branches', 'reset', 'test/e2e', '--parent', '-o', 'json'],
      ['branches', 'get', 'br-parent', '-o', 'json'],
    ]);
  });

  it('fails with the install hint when the CLI is absent, before touching any branch', () => {
    // The shell's message ends in a line break, which must not land inside ours.
    const neon = fakeNeon({ '--version': new Error("'neon' is not recognized\r\n") });

    expect(() => resetBranchToParent('test/e2e', neon.run)).toThrowErrorMatchingInlineSnapshot(
      `[Error: The Neon CLI is not installed, so the page suite cannot reset its branch test/e2e before seeding. Install it with \`npm install -g neonctl\` and sign in with \`neon auth\`. ('neon' is not recognized)]`,
    );
    expect(neon.calls).toEqual([['--version']]);
  });

  it('lets a failed reset surface as-is', () => {
    const neon = fakeNeon({
      '--version': '4.17.1\n',
      'branches reset test/e2e --parent -o json': new Error('ERROR: branch not found'),
    });

    expect(() => resetBranchToParent('test/e2e', neon.run)).toThrow('ERROR: branch not found');
  });

  it('refuses a branch that reports no parent rather than seeding on top of whatever it holds', () => {
    const neon = fakeNeon({
      '--version': '4.17.1\n',
      'branches reset test/e2e --parent -o json': JSON.stringify({ id: 'br-root', name: 'test/e2e' }),
    });

    expect(() => resetBranchToParent('test/e2e', neon.run)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Neon branch test/e2e (br-root) has no parent to reset to.]`,
    );
  });
});
