import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@/features/session/session';
import { SESSION_SPORTS } from '@/features/session/session-sport';

/**
 * `showable-version/52` — what the card draws for a sport, a parked session and
 * an athlete's own session, read from the rendered markup. The mocks are the
 * ones `calendar.test.tsx` uses: `t` returns its key, the overlays are stubs.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'date' }),
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./move-actions', () => ({ moveSessionAction: vi.fn() }));
vi.mock('./availability-actions', () => ({
  markUnavailableDateAction: vi.fn(),
  clearUnavailableDateAction: vi.fn(),
}));
vi.mock('./rating-modal', () => ({ RatingModal: () => null }));
vi.mock('./session-drawer', () => ({ SessionDrawer: () => null }));
vi.mock('./redraft-card', () => ({ RedraftCard: () => null }));
vi.mock('./drafting-card', () => ({ DraftingCard: () => null }));
vi.mock('./proposal-card', () => ({ ProposalCard: () => null }));
vi.mock('./health-drawer', () => ({ HealthDrawer: () => null }));

const { Calendar } = await import('./calendar');

const TODAY = '2026-08-19';

const session = (over: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  date: '2026-08-21',
  version: 1,
  type: 'Endurance',
  status: 'planned',
  parked: false,
  dayOrder: 0,
  title: 'Long ride',
  duration: 120,
  zone: '2',
  note: null,
  feedbackBody: null,
  feedbackMind: null,
  feedbackComment: null,
  origin: 'coach',
  isTraining: true,
  summary: null,
  howTo: null,
  sport: null,
  ...over,
});

const render = (props: Partial<Parameters<typeof Calendar>[0]> = {}) =>
  renderToStaticMarkup(<Calendar sessions={[session()]} unavailableDates={[]} todayKey={TODAY} {...props} />);

const cardTag = (html: string) => html.match(/<(?:button|div)[^>]*data-card-state="[^"]*"[^>]*>/)?.[0] ?? '';
const classesOf = (html: string) => (cardTag(html).match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/);
const labelOf = (html: string) => cardTag(html).match(/aria-label="([^"]*)"/)?.[1] ?? '';
const iconTag = (html: string) => html.match(/<svg[^>]*data-card-icon="[^"]*"[^>]*>/)?.[0] ?? '';

describe('Calendar card — the sport icon', () => {
  it('draws each of the seven sports as its own icon, named by that sport', () => {
    const icons = SESSION_SPORTS.map((sport) => {
      const tag = iconTag(render({ sessions: [session({ sport })] }));
      expect(tag).toContain(`aria-label="sports.${sport}"`);
      expect(tag).toContain('role="img"');
      expect(tag).not.toContain('aria-hidden');
      return tag.match(/data-card-icon="([^"]*)"/)?.[1];
    });
    expect(icons).toEqual(['Waves', 'Bike', 'Footprints', 'BrickWall', 'Dumbbell', 'StretchHorizontal', 'Shapes']);
  });

  it('keeps the same icon for every Session Type, and Circle for none', () => {
    for (const type of ['Endurance', 'Intensity', 'Tempo', 'Recovery', 'Rest']) {
      expect(iconTag(render({ sessions: [session({ type, sport: 'brick' })] }))).toContain('data-card-icon="BrickWall"');
      const none = iconTag(render({ sessions: [session({ type, sport: null })] }));
      expect(none).toContain('data-card-icon="Circle"');
      expect(none).toContain('aria-hidden="true"');
      expect(none).not.toContain('role="img"');
      expect(none).not.toContain('aria-label');
    }
  });

  it('draws Circle, hidden, for a sport the card does not know', () => {
    const tag = iconTag(render({ sessions: [session({ sport: 'kayaking' })] }));
    expect(tag).toContain('data-card-icon="Circle"');
    expect(tag).toContain('aria-hidden="true"');
  });
});

describe('Calendar card — the parked mark and the athlete outline', () => {
  it('dashes and fades a parked session whoever wrote it, but never a live one', () => {
    for (const origin of ['coach', 'head_coach'] as const) {
      const parked = classesOf(render({ sessions: [session({ origin, parked: true })] }));
      expect(parked).toContain('border-dashed');
      expect(parked).toContain('opacity-70');
      const live = classesOf(render({ sessions: [session({ origin })] }));
      expect(live).not.toContain('border-dashed');
      expect(live).not.toContain('opacity-70');
    }
  });

  it('fades a parked athlete session but keeps its solid foreground outline', () => {
    const parked = classesOf(render({ sessions: [session({ origin: 'athlete', parked: true })] }));
    expect(parked).toContain('opacity-70');
    expect(parked).toContain('border-foreground');
    expect(parked).not.toContain('border-dashed');
    expect(parked).not.toContain('border-border');
  });

  it('gives an athlete session its own outline and fill on top of the card base', () => {
    const own = classesOf(render({ sessions: [session({ origin: 'athlete' })] }));
    expect(own).toEqual(expect.arrayContaining(['border', 'border-l-4', 'border-foreground', 'bg-card']));
    expect(own).not.toContain('border-border');
    const other = classesOf(render({ sessions: [session({ origin: 'coach' })] }));
    expect(other).toEqual(expect.arrayContaining(['border', 'border-l-4', 'border-border', 'bg-card']));
    expect(other).not.toContain('border-foreground');
  });

  it('keeps the person mark on a completed or skipped athlete session, beside the check', () => {
    const done = render({ sessions: [session({ origin: 'athlete', status: 'completed' })] });
    expect(done).toContain('data-card-author="athlete"');
    expect(done).toContain('data-card-done');
    expect(cardTag(done)).toContain('data-card-state="done"');
    const skipped = render({ sessions: [session({ origin: 'athlete', status: 'skipped' })] });
    expect(skipped).toContain('data-card-author="athlete"');
    expect(skipped).not.toContain('data-card-done');
    expect(cardTag(skipped)).toContain('data-card-state="missed"');
  });

  it('marks the person icon as decoration', () => {
    const own = render({ sessions: [session({ origin: 'athlete' })] });
    expect(own.match(/<svg[^>]*data-card-author="athlete"[^>]*>/)?.[0]).toContain('aria-hidden="true"');
  });
});

describe('Calendar card — the author line in the accessible name', () => {
  it('sits after the meta and before the refusal', () => {
    const html = render({
      sessions: [
        session({ origin: 'athlete', type: 'Strength', title: 'Core', status: 'completed', duration: 30, zone: null }),
      ],
    });
    expect(labelOf(html)).toBe('Core · Strength · completed · 30minutes · authorYou · bounceFrozen');
  });

  it('says "you" to the athlete even when the athlete has a name, and nothing for a session someone else wrote', () => {
    const own = render({ athleteName: 'Mia', sessions: [session({ origin: 'athlete' })] });
    expect(labelOf(own)).toContain('authorYou');
    expect(labelOf(own)).not.toContain('authorNamed');
    const asCoach = { readOnly: true, coachAthleteId: 'ath_1', athleteName: 'Mia' };
    for (const origin of ['coach', 'head_coach', 'arithmetic'] as const) {
      expect(labelOf(render({ ...asCoach, sessions: [session({ origin })] }))).not.toMatch(/author/);
    }
  });

  it('says "the athlete" to a Head Coach when the name is blank', () => {
    const asCoach = { readOnly: true, coachAthleteId: 'ath_1', sessions: [session({ origin: 'athlete' })] };
    expect(labelOf(render({ ...asCoach, athleteName: '   ' }))).toContain('authorAthlete');
    expect(labelOf(render({ ...asCoach, athleteName: 'Mia' }))).not.toContain('authorYou');
  });
});
