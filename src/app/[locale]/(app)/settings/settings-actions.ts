'use server';

import { hasLocale } from 'next-intl';
import {
  addFixedConstraint,
  mergeAthleteProfile,
  removeFixedConstraint,
  updateCommunicationStyle,
  updateRaceTarget,
} from '@/features/athlete/athlete-repository';
import { resolveAthlete, resolveUserId } from '../../current-actor';
import {
  severLinkForAthlete,
  updateLinkVisibility,
} from '@/features/coach/coach-repository';
import type { LinkVisibility } from '@/features/coach/link-visibility';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import { setUiLanguage } from '@/features/user-prefs/user-prefs-repository';
import { routing } from '@/i18n/routing';

/**
 * The outcome every Settings action returns. Beyond the write itself, an
 * action can fail on authentication or on input outside its closed option
 * set — the two things resolved here, before a feature module is ever reached.
 */
export type SettingsActionResult =
  | { ok: true }
  | { ok: false; reason: 'not-authenticated' | 'invalid' };

// One source for the weekday set, like the onboarding UI already keeps
// (`onboarding.tsx`'s "One source for every option set" comment) — the
// validation module, not a copy hand-kept here.
const DAYS: readonly string[] = ONBOARDING_OPTIONS.days;
// Weekly Session Day additionally allows "Flexible". Settings offers every
// weekday, not onboarding's narrower three-day example set — CONTEXT.md
// defines the field as any day, "may be Flexible", with no restriction to
// the MCQ's shortlist.
const WEEKLY_SESSION_DAY_OPTIONS: readonly string[] = [...DAYS, 'Flexible'];
const COMMUNICATION_STYLE_MAX = 300;
const RACE_TARGET_MAX = 120;

/**
 * The acting athlete, resolved from the authenticated session — never from the
 * request body (ADR 0006). The full {@link Athlete}, not just an id: Fixed
 * Constraints reads the current list before writing the next one.
 */
const actingAthlete = resolveAthlete;

/**
 * Communication Style, corrected by the athlete in their own words. Onboarding
 * derives a first draft (`buildCommStyle`); this is where it stays accurate
 * afterward. Free text, so the only gate is a length cap against abuse.
 */
export async function updateCommunicationStyleAction(
  value: string,
): Promise<SettingsActionResult> {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > COMMUNICATION_STYLE_MAX) {
    return { ok: false, reason: 'invalid' };
  }

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await updateCommunicationStyle(athlete.id, trimmed);
  return { ok: true };
}

/**
 * The race target, changed after onboarding. Free text (a race name and date as
 * the athlete says it — "Ironman Copenhagen 2026-08-16"), so the only gate is a
 * length cap; an empty value clears the target rather than storing "".
 *
 * Deliberately not an identity field: this is a public race, not a person, and
 * it already reaches the prompt from onboarding (`renderWeeklyPrompt`'s `race=`).
 */
export async function updateRaceTargetAction(
  value: string,
): Promise<SettingsActionResult> {
  const trimmed = value.trim();
  if (trimmed.length > RACE_TARGET_MAX) return { ok: false, reason: 'invalid' };

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await updateRaceTarget(athlete.id, trimmed || null);
  return { ok: true };
}

/** Weekly Session Day — any weekday, or Flexible. */
export async function updateWeeklySessionDayAction(
  day: string,
): Promise<SettingsActionResult> {
  if (!WEEKLY_SESSION_DAY_OPTIONS.includes(day)) {
    return { ok: false, reason: 'invalid' };
  }

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await mergeAthleteProfile(athlete.id, { weeklySessionDay: day });
  return { ok: true };
}

/**
 * Adds one recurring no-train day to Fixed Constraints.
 *
 * The next array is derived inside the UPDATE ({@link addFixedConstraint}), not
 * computed here from a value read a moment ago: two edits in flight together
 * would otherwise each write a list missing the other's day. The repository
 * function is idempotent, so the "already there" case needs no check here.
 */
export async function addFixedConstraintAction(
  day: string,
): Promise<SettingsActionResult> {
  if (!DAYS.includes(day)) return { ok: false, reason: 'invalid' };

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await addFixedConstraint(athlete.id, day);
  return { ok: true };
}

/** Removes one day from Fixed Constraints — same atomicity reasoning as adding. */
export async function removeFixedConstraintAction(
  day: string,
): Promise<SettingsActionResult> {
  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await removeFixedConstraint(athlete.id, day);
  return { ok: true };
}

/**
 * Athlete Language — applies to the UI and the Coach immediately (CONTEXT.md).
 * This persists the choice; the client navigates to the new locale route once
 * it resolves, the same split onboarding's language step uses (`onboarding.tsx`'s
 * `chooseLanguage`).
 */
export async function updateLanguageAction(
  language: string,
): Promise<SettingsActionResult> {
  if (!hasLocale(routing.locales, language)) {
    return { ok: false, reason: 'invalid' };
  }

  const userId = await resolveUserId();
  if (!userId) return { ok: false, reason: 'not-authenticated' };

  await setUiLanguage(userId, language);
  return { ok: true };
}

const VISIBILITY_SECTIONS: readonly (keyof LinkVisibility)[] = [
  'shareAthleteReports',
  'shareAiTranscripts',
];

/**
 * One Link Visibility flag, toggled. Authorization is the WHERE clause inside
 * {@link updateLinkVisibility} (scoped to the athlete's own active Coaching
 * Link) — the section name is the only untrusted input here, checked against
 * the closed set before it reaches SQL.
 */
export async function updateLinkVisibilityAction(
  section: keyof LinkVisibility,
  on: boolean,
): Promise<SettingsActionResult> {
  if (!VISIBILITY_SECTIONS.includes(section)) {
    return { ok: false, reason: 'invalid' };
  }

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await updateLinkVisibility(athlete.id, { [section]: on });
  return { ok: true };
}

/**
 * Severs the athlete's own Coaching Link — cuts all access, including
 * history, from either side (CONTEXT.md). Irreversible from this screen (a
 * fresh link needs a new invite), so the confirming UI lives in the view;
 * this performs the write once confirmed.
 */
export async function severCoachingLinkAction(): Promise<SettingsActionResult> {
  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await severLinkForAthlete(athlete.id);
  return { ok: true };
}
