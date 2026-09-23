import { describe, it, expect, vi } from 'vitest';
import { codeOf, filesMatching, srcPath, SWEEP_TIMEOUT_MS } from '@/test/source-sweep';
import { buildChatPrompt } from '@/features/coach/prompts';
import { capacityStatement } from './capacity';
import type { CheckIn } from '@/features/coach/check-in';

/**
 * These tests walk every file under `src/` and read it. That takes well under a
 * second on an ordinary run and past the 5 s default when the suite runs with
 * v8 coverage instrumentation — which is the hardening gate's first step, so the
 * flake stopped the gate rather than a test run. The assertions are unchanged;
 * only the time the walk is allowed to take is (`code-health/11`).
 */
vi.setConfig({ testTimeout: 30_000 });


/**
 * [ADR 0011](../../../docs/adr/0011-an-injury-is-split-by-who-reads-it.md): an
 * injury's **detail thread never enters a prompt, ever.**
 *
 * The acceptance criterion asks for this to be *"asserted by a test, not by
 * inspection"*, and it is asserted twice — once against a rendered prompt, and
 * once against the shape of the code, because the two catch different failures.
 * A rendered-string test proves today's prompt is clean; the structural test
 * proves nobody can quietly give the prompt path a reader.
 */
describe('the detail thread does not reach the model', () => {
  const BASE: CheckIn = {
    phase: 'Block 1 of 4',
    commStyle: '',
    experienceLevel: 'intermediate',
    presenceStage: 'full',
    language: 'English',
    weeklySessionDay: 'Monday',
    fixedConstraints: [],
    equipment: [],
  };

  it('renders what the injury prevents, and nothing about what it is', () => {
    const capacity = capacityStatement(
      [{ capacity: { swim: 'full', bike: 'easy', run: 'none' } }],
      false,
    );

    const prompt = buildChatPrompt({ ...BASE, presenceStage: 'full', capacity }, '2026-08-18');

    // The capacity half is there.
    expect(prompt).toContain('no run');
    expect(prompt).toContain('bike easy only');
    expect(prompt).toContain('not a diagnosis');

    // The kind of sentence a detail thread actually holds is not — and cannot
    // be, because no field on the way here can carry it.
    for (const clinical of ['achilles', 'tendinopathy', 'physio', 'left', 'MRI', 'knee']) {
      expect(prompt.toLowerCase()).not.toContain(clinical.toLowerCase());
    }
  });

  it('is read by nothing outside its own feature', () => {
    // The structural half, and the stronger one. `healthNotes` and the two
    // functions that touch it are the whole surface; if a prompt builder, a
    // Coach service or a briefing ever imports one, this list grows and the test
    // says which file. Stripping comments first so the prose explaining the rule
    // is not itself a violation.
    const readers = filesMatching(/healthNotes|addHealthNote|getHealthNotes/, { self: import.meta.url });

    // Slice 06 added the readers that show the thread to humans — the drawer,
    // the actions behind it, and the Head Coach's link-gated service. None of
    // them is on a prompt path, and the next test checks that separately.
    expect(readers).toEqual([
      'app/[locale]/(app)/coach/athlete/[athleteId]/health-actions.test.ts',
      'app/[locale]/(app)/coach/athlete/[athleteId]/health-actions.ts',
      'app/[locale]/health-actions.test.ts',
      'app/[locale]/health-actions.ts',
      'app/[locale]/health-drawer.test.tsx',
      'app/[locale]/health-drawer.tsx',
      'db/schema.ts',
      'features/health/health-repository.test.ts',
      'features/health/health-repository.ts',
      'features/health/health-service.test.ts',
      'features/health/health-service.ts',
    ]);
  }, SWEEP_TIMEOUT_MS);

  /**
   * The Bother Rating (slice 06) lives on the same side of the split as the
   * thread: human eyes only. There is no allowlist for it because the column is
   * legitimately read by the calendar layer and the drawer — instead, every
   * module that renders or assembles a prompt is asserted never to name it.
   */
  it('the Bother Rating is named by nothing on the prompt path', () => {
    const promptPath = [
      'features/coach/prompts.ts',
      'features/coach/prompt-blocks.ts',
      'features/coach/check-in.ts',
      'features/coach/weekly-session.ts',
      'features/coach/weekly-session-service.ts',
      'features/coach/coach-chat-service.ts',
      'features/coach/briefing.ts',
      'features/coach/briefing-service.ts',
      'features/health/capacity.ts',
    ];
    for (const rel of promptPath) {
      const src = codeOf(srcPath(rel));
      expect(src, rel).not.toMatch(/\bbother\b/i);
    }
  });

  it('has no field on the prompt-facing type that could carry it', () => {
    // `capacityStatement` takes injuries as `{ capacity }` and nothing else, so
    // there is no argument position a note could arrive in. Passing one is a
    // type error at build time; at runtime it is ignored rather than rendered.
    const smuggled = [
      {
        capacity: { swim: 'full', bike: 'full', run: 'none' },
        note: 'left Achilles, physio says tendinopathy',
      },
    ] as unknown as Parameters<typeof capacityStatement>[0];

    expect(capacityStatement(smuggled, false)).not.toContain('Achilles');
    expect(capacityStatement(smuggled, false)).not.toContain('physio');
  });
});
