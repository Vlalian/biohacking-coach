import type { OpenHealth } from '@/features/coach/roster-service';

/**
 * What is open for an athlete right now, on the surfaces a Head Coach reaches
 * them from: the Roster row and the athlete's plan-page header
 * (`showable-version/28b`).
 *
 * Three states, and the third is the point. An athlete with nothing open
 * renders nothing; an athlete with an open record renders it by name; an
 * athlete who **withholds their reports** (`openHealth` null) renders nothing
 * *as well* — identical to having nothing open, deliberately, because a badge
 * that appeared only for shared-and-healthy would let the coach read health
 * from its absence. The gate lives in `roster-service.ts`; this component's
 * job is not to leak it back.
 *
 * Labels arrive resolved: the page is a Server Component holding its own
 * `getTranslations`, and a nameless injury is named here rather than in the
 * service, which renders no words at all.
 */
export function HealthBadge({
  openHealth,
  injuryLabel,
  illLabel,
}: {
  openHealth: OpenHealth | null;
  /** What an Injury with no name is called — `injury.name` is optional. */
  injuryLabel: string;
  illLabel: string;
}) {
  if (!openHealth) return null;
  const parts = [
    ...openHealth.injuries.map((name) => name ?? injuryLabel),
    ...(openHealth.ill ? [illLabel] : []),
  ];
  if (parts.length === 0) return null;

  return (
    <span
      data-health-badge
      className="rounded-full border border-signal px-2 py-0.5 text-signal"
    >
      {parts.join(' · ')}
    </span>
  );
}
