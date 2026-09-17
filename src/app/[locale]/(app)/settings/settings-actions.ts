'use server';

import { hasLocale } from 'next-intl';
import { RACE_DISTANCES, type RaceDistance } from '@/lib/race-distances';
import { isCalendarDate } from '@/lib/calendar-date';
import {
  clearTargetRace,
  createRace,
  deleteRace,
  getRaces,
  getTargetRace,
  setTargetRace,
  upsertTargetRace,
  type NewRace,
} from '@/features/race/race-repository';
import {
  addFixedConstraint,
  mergeAthleteProfile,
  removeFixedConstraint,
  updateCommunicationStyle,
  updateRaceTarget,
  updateRaceDistance,
} from '@/features/athlete/athlete-repository';
import { resolveAthlete, resolveUserId } from '../../current-actor';
import {
  getLinkForAthlete,
  severLinkForAthlete,
  updateLinkVisibility,
} from '@/features/coach/coach-repository';
import { withdrawPreviewDrafts } from '@/features/coach/week-draft-repository';
import { today } from '@/lib/date';
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
  // `linked`: the field belongs to the Head Coach while a Coaching Link is
  // active (ADR 0003 amendment, 2026-09-14) — the athlete's tiles are read-only.
  | { ok: false; reason: 'not-authenticated' | 'invalid' | 'linked' };

/**
 * Adding a Race is the one Settings action whose caller needs something back:
 * the persisted id, so the list can remove or target the new race without a
 * reload (CodeRabbit, PR #67). Same failure half as every other action.
 */
export type AddRaceResult =
  | { ok: true; raceId: string }
  | { ok: false; reason: 'not-authenticated' | 'invalid' };

// One source for the weekday set, like the onboarding UI already keeps
// (`onboarding.tsx`'s "One source for every option set" comment) — the
// validation module, not a copy hand-kept here.
const DAYS: readonly string[] = ONBOARDING_OPTIONS.days;
// The seven weekdays, no "Flexible" (retired 2026-09-14, CONTEXT.md).
const WEEKLY_SESSION_DAY_OPTIONS: readonly string[] = DAYS;
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
 * The Race Distance, changed after onboarding.
 *
 * Closed set (`training-architecture/02`), checked here with the same list
 * onboarding uses. Settings is a second door onto the same column, and a door
 * with a weaker lock is not a door. There is no "clear" — every athlete has a
 * distance once they have answered, because it is what shapes their week
 * whether or not a race is booked.
 */
export async function updateRaceDistanceAction(
  value: string,
): Promise<SettingsActionResult> {
  if (!(RACE_DISTANCES as readonly string[]).includes(value)) {
    return { ok: false, reason: 'invalid' };
  }

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  await updateRaceDistance(athlete.id, value);
  return { ok: true };
}

/**
 * The Target Race, changed after onboarding — name and date together.
 *
 * Together because a race with no date is what the free-text field used to
 * allow, and what four regexes then guessed at. Emptying both is a real state
 * (an athlete between races) and clears the target while keeping the races
 * themselves, which are a record.
 *
 * `athlete.raceTarget` is written alongside the race row on purpose: the Coach's
 * session-1 arc and the onboarding greeting both read that column, so a race
 * edited in one place and not the other would leave two answers to one question.
 */
export async function updateTargetRaceAction(
  name: string,
  date: string,
): Promise<SettingsActionResult> {
  const trimmedName = name.trim();
  const trimmedDate = date.trim();
  if (trimmedName.length > RACE_TARGET_MAX) return { ok: false, reason: 'invalid' };

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  if (!trimmedName && !trimmedDate) {
    await clearTargetRace(athlete.id);
    await updateRaceTarget(athlete.id, null);
    return { ok: true };
  }

  if (!trimmedName || !isCalendarDate(trimmedDate)) return { ok: false, reason: 'invalid' };
  // A Race carries a distance and there is nowhere honest to get one from when
  // the athlete has never answered the question. Deriving it from the race name
  // is exactly the habit this slice removed.
  const distance = athlete.raceDistance;
  if (!distance || !(RACE_DISTANCES as readonly string[]).includes(distance)) {
    return { ok: false, reason: 'invalid' };
  }

  await upsertTargetRace(athlete.id, {
    name: trimmedName,
    date: trimmedDate,
    distance: distance as RaceDistance,
  });
  await updateRaceTarget(athlete.id, trimmedName);
  return { ok: true };
}

/**
 * Adds a Race (`training-architecture/09`).
 *
 * The first race an athlete adds becomes the Target Race — there is nothing
 * else it could be — and its name goes to the mirror column for the same reason
 * `updateTargetRaceAction` writes it. A race added beside an existing target is
 * a non-target: a Tune-up Race if it falls before the target, or simply a later
 * race. Each Race carries its own distance, because a tune-up is usually a
 * different distance from the one being trained for.
 */
export async function addRaceAction(
  name: string,
  date: string,
  distance: string,
): Promise<AddRaceResult> {
  const newRace = parseNewRace(name, date, distance);
  if (!newRace) return { ok: false, reason: 'invalid' };

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  const asTarget = (await getTargetRace(athlete.id)) === null;
  const raceId = await createRace(athlete.id, newRace, { asTarget });
  if (asTarget) await updateRaceTarget(athlete.id, newRace.name);
  return { ok: true, raceId };
}

/** A Race as the form typed it, or null when any part of it is not one. */
function parseNewRace(name: string, date: string, distance: string): NewRace | null {
  const trimmedName = name.trim();
  const trimmedDate = date.trim();
  const nameOk = trimmedName !== '' && trimmedName.length <= RACE_TARGET_MAX;
  const distanceOk = (RACE_DISTANCES as readonly string[]).includes(distance);
  if (!nameOk || !distanceOk || !isCalendarDate(trimmedDate)) return null;
  return { name: trimmedName, date: trimmedDate, distance: distance as RaceDistance };
}

/**
 * Points the athlete at a different Race as the Target Race.
 *
 * The target is *chosen*, never derived as "the next one" (CONTEXT.md): an
 * athlete with an Olympic in May and an Ironman in August is building toward
 * August. Training Blocks re-derive on the next read — nothing is stored for
 * them — and the mirror column follows the flag so the greeting and the prompt
 * never name different races.
 */
export async function setTargetRaceAction(raceId: string): Promise<SettingsActionResult> {
  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  // Resolved through the athlete's own races, so an id that is not theirs is
  // an invalid input here rather than a write the repository has to refuse.
  const race = (await getRaces(athlete.id)).find((r) => r.id === raceId);
  if (!race) return { ok: false, reason: 'invalid' };

  await setTargetRace(athlete.id, race.id);
  await updateRaceTarget(athlete.id, race.name);
  return { ok: true };
}

/**
 * Removes a Race the athlete entered. Removing the Target Race leaves them with
 * none — a real state, "between races" — and clears the mirror column so no
 * surface keeps naming a race that no longer exists.
 */
export async function removeRaceAction(raceId: string): Promise<SettingsActionResult> {
  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  const race = (await getRaces(athlete.id)).find((r) => r.id === raceId);
  if (!race) return { ok: false, reason: 'invalid' };

  await deleteRace(athlete.id, race.id);
  if (race.isTarget) await updateRaceTarget(athlete.id, null);
  return { ok: true };
}

/** Weekly Session Day — any weekday. */
export async function updateWeeklySessionDayAction(
  day: string,
): Promise<SettingsActionResult> {
  if (!WEEKLY_SESSION_DAY_OPTIONS.includes(day)) {
    return { ok: false, reason: 'invalid' };
  }

  const athlete = await actingAthlete();
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  // One field, whoever is present writes it: while a Head Coach is linked the
  // day is theirs to set (`training-architecture/17`), and the athlete is told
  // so on the tiles rather than silently overruled here.
  if (await getLinkForAthlete(athlete.id)) return { ok: false, reason: 'linked' };

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
  // A draft still in the departed coach's preview is discarded, not delivered
  // half-shaped (Mads, 2026-09-14); the next app-open drafts afresh.
  await withdrawPreviewDrafts(athlete.id, today());
  return { ok: true };
}
