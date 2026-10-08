import { isRaceTooClose } from '@/features/coach/open-horizon';

/**
 * Where a session sits against the Target Race (`training-architecture/55`).
 * Distancens Arkitektur §08 (Hvem gør hvad) finds the Training Phase a driver of
 * the rest between speed reps: generous early, tight near the race. Mads ruled
 * on 2026-10-01 that the phase is the days to the Target Race, with 56 days
 * (8 weeks, the line `isRaceTooClose` already draws) as the boundary. It reads
 * no Training Block and no block name.
 */
export type RacePhase = 'early' | 'close';

/**
 * `close` from race day back to 55 days before it; `early` from 56 days out, for
 * a session after the race, and with no race at all (Open Horizon).
 */
export function racePhaseOf(sessionDate: string, targetRaceDate: string | null): RacePhase {
  return targetRaceDate !== null && isRaceTooClose(sessionDate, targetRaceDate) ? 'close' : 'early';
}
