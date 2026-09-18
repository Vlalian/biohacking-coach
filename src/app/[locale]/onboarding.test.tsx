import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { OnboardingAnswers, OnboardingStepId } from '@/features/onboarding/onboarding-flow';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

/**
 * `showable-version/32` — onboarding has a way back. Back on every step after
 * the first; the step re-entered shows its saved answer; after re-answering,
 * the athlete walks forward again through the later steps, each pre-filled.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('./onboarding-actions', () => ({ answerOnboardingAction: vi.fn() }));

const { OnboardingFlow } = await import('./onboarding');

const ANSWERED: OnboardingAnswers = {
  language: 'en',
  experienceLevel: 'intermediate',
  raceDistance: 'Full',
  raceTarget: 'Ironman Copenhagen',
  raceDate: '2027-08-15',
  availableHours: '6–10h',
  weeklySessionDay: 'Wednesday',
  fixedConstraints: ['Thursday'],
};

function render(step: OnboardingStepId, answers: OnboardingAnswers = {}) {
  return renderToStaticMarkup(<OnboardingFlow initial={{ step, answers }} />);
}

describe('OnboardingFlow — the way back', () => {
  it('shows Back on every step after the first, never on the first', () => {
    expect(render('language')).not.toContain('data-action="back"');
    for (const step of ['experience', 'distance', 'race', 'adaptive', 'constraints'] as const) {
      expect(render(step, ANSWERED), step).toContain('data-action="back"');
    }
  });

  it('a tile step re-entered marks the saved answer selected; a form step seeds its fields from the saved answers', () => {
    // OptionTile renders `aria-pressed` from `selected`; the label follows in
    // the same button. Before this, every tile on the pick-and-submit steps
    // rendered `selected={false}` and every draft started empty.
    const experience = render('experience', ANSWERED);
    expect(experience).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>expIntermediate\(\)/);
    expect(experience).not.toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>expBeginner\(\)/);
    expect(render('language', ANSWERED)).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>English/);
    expect(render('distance', ANSWERED)).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>optFull\(\)/);
    const race = render('race', ANSWERED);
    expect(race).toContain('value="Ironman Copenhagen"');
    expect(race).toContain('value="2027-08-15"');
    expect(render('adaptive', ANSWERED)).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>opt610\(\)/);
    const constraints = render('constraints', ANSWERED);
    expect(constraints).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>dayWednesday\(\)/);
    expect(constraints).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>dayThursday\(\)/);
    expect(constraints).not.toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>dayMonday\(\)/);
  });

  it('moves the cursor with cursorAfter, not with the step the server reports', () => {
    // Static markup cannot click. The handler is a source assertion, the
    // helper it calls is tested in onboarding-flow.test.ts.
    const source = readFileSync(new URL('./onboarding.tsx', import.meta.url), 'utf8');
    expect(source).toContain('step: cursorAfter(payload.step, result.step)');
    expect(source).not.toContain('step: result.step,');
  });

  it('both languages carry the Back label', () => {
    expect(en.Onboarding.back).toBeTruthy();
    expect(da.Onboarding.back).toBeTruthy();
  });
});
