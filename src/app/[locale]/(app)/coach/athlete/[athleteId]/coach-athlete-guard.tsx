import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getCoachByUserId } from '@/features/coach/coach-repository';
import { getCoachAthleteView, type CoachAthleteView } from '@/features/coach/roster-service';
import type { Coach } from '@/features/coach/coach';
import { dateKey } from '@/lib/date';

/**
 * The guard every tab of the Head Coach's athlete surface runs for itself.
 *
 * It exists because a Next.js layout does NOT protect the pages beneath it:
 * each of `plan`, `information` and `briefing` is independently reachable by
 * URL, so each has to prove the coach and the Coaching Link on its own. Sharing
 * the guard as one function is what keeps three copies of an authorization
 * check from drifting apart — the failure mode this repo has been bitten by in
 * documents and would be far more expensive in code.
 *
 * The gate itself is `getCoachAthleteView`, which returns null unless an active
 * Coaching Link joins this coach to this athlete. A forged athlete id lands on
 * a 404 — indistinguishable from an athlete that does not exist, so it leaks
 * nothing about who is on other coaches' rosters.
 */
export type CoachAthleteContext =
  | { ok: true; coach: Coach; view: CoachAthleteView; todayKey: string }
  | { ok: false };

export async function loadCoachAthlete(
  locale: string,
  athleteId: string,
): Promise<CoachAthleteContext> {
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/sign-in', locale });
  }

  const coach = await getCoachByUserId(session!.user.id);
  // Not a coach at all: not a 404 (the page exists), just not theirs.
  if (!coach) return { ok: false };

  const todayKey = dateKey(new Date());
  const view = await getCoachAthleteView(coach.id, athleteId, todayKey);
  if (!view) {
    notFound();
  }

  return { ok: true, coach, view: view!, todayKey };
}

/** What a signed-in non-coach sees on any of these tabs. */
export async function NotACoach() {
  const t = await getTranslations('Roster');
  return (
    <div className="flex flex-col items-center gap-6 p-6 sm:p-8">
      <p className="text-neutral-500">{t('notACoach')}</p>
    </div>
  );
}
