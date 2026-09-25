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
  pastRaces: [{ distance: 'Half', date: '2025-08-16', finishSeconds: 18720, note: 'hot day' }],
  experienceLevel: 'intermediate',
  raceDistance: 'Full',
  hoursPerWeek: 8,
  raceTarget: 'Ironman Copenhagen',
  raceDate: '2027-08-15',
  weeklySessionDay: 'Wednesday',
  fixedConstraints: ['Thursday'],
};

function render(step: OnboardingStepId, answers: OnboardingAnswers = {}) {
  return renderToStaticMarkup(<OnboardingFlow initial={{ step, answers, accountName: 'Mads' }} />);
}

describe('OnboardingFlow — the way back', () => {
  it('shows Back on every step after the first, never on the first', () => {
    expect(render('language')).not.toContain('data-action="back"');
    for (const step of ['pastRaces', 'distance', 'hours', 'race', 'adaptive', 'constraints'] as const) {
      expect(render(step, ANSWERED), step).toContain('data-action="back"');
    }
  });

  it('a tile step re-entered marks the saved answer selected; a form step seeds its fields from the saved answers', () => {
    // OptionTile renders `aria-pressed` from `selected`; the label follows in
    // the same button. Before this, every tile on the pick-and-submit steps
    // rendered `selected={false}` and every draft started empty.
    // The past-races step re-entered lists the saved race; the hours step carries the saved number.
    expect(render('pastRaces', ANSWERED)).toContain('data-past-race="0"');
    expect(render('hours', ANSWERED)).toContain('value="8"');
    expect(render('language', ANSWERED)).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>English/);
    expect(render('distance', ANSWERED)).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>optFull\(\)/);
    const race = render('race', ANSWERED);
    expect(race).toContain('value="Ironman Copenhagen"');
    expect(race).toContain('value="2027-08-15"');
    expect(render('adaptive', { ...ANSWERED, hasHumanCoach: 'Yes' })).toMatch(/aria-pressed="true"[^>]*>[^<]*<span[^>]*>optYes\(\)/);
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

  it('the adaptive panel submits only the fields its level asks', () => {
    const source = readFileSync(new URL('./onboarding.tsx', import.meta.url), 'utf8');
    expect(source).toContain('ADAPTIVE_FIELDS_BY_LEVEL[');
  });

  it('both languages carry the Back label', () => {
    expect(en.Onboarding.back).toBeTruthy();
    expect(da.Onboarding.back).toBeTruthy();
  });
});

describe('OnboardingFlow — hours and past races (training-architecture/35)', () => {
  it('renders the hours step with a number input 1–50 and no suggested value', () => {
    const hours = render('hours', {});
    expect(hours).toContain('type="number"');
    expect(hours).toContain('min="1"');
    expect(hours).toContain('max="50"');
    expect(hours).toContain('data-action="submit-hours"');
    // No default: "A and only A" — the field starts empty and offers no number.
    expect(hours).toMatch(/type="number"[^>]*value=""/);
    expect(hours).not.toContain('placeholder="8"');
  });

  it('renders the pastRaces step with an add row and a no-races action', () => {
    const races = render('pastRaces', {});
    expect(races).toContain('data-action="add-past-race"');
    expect(races).toContain('data-action="no-past-races"');
    expect(races).toContain('data-action="submit-past-races"');
    for (const d of ['optSprint', 'optOlympic', 'optHalf', 'optFull']) expect(races).toContain(d);
  });

  it('both languages carry the new questions and none of the old experience tiles', () => {
    for (const cat of [en, da]) {
      for (const k of ['qHours', 'qHoursSub', 'qPastRaces', 'qPastRacesSub', 'noPastRaces', 'pastRaceFinish', 'pastRaceNote', 'addPastRace', 'removePastRace', 'stepHours', 'stepPastRaces']) {
        expect((cat.Onboarding as Record<string, string>)[k], k).toBeTruthy();
      }
      for (const k of ['qExperience', 'expBeginner', 'availableHours', 'opt610']) {
        expect((cat.Onboarding as Record<string, string>)[k], k).toBeUndefined();
      }
    }
  });
});

describe('OnboardingFlow — the race step (training-architecture/40)', () => {
  it('tells an athlete with no race what they will not get, and where to set one', () => {
    const html = render('race', ANSWERED);
    expect(html).toContain('noRaceYetNote');
    // The note sits with the "no race yet" choice, after it, not above the race fields.
    expect(html.indexOf('noRaceYetNote')).toBeGreaterThan(html.indexOf('noRaceYet()'));
  });
});
