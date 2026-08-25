import '../src/db/load-env';
import { getAllAthleteIds, getMetricsInput } from '../src/features/metrics/metrics-repository';
import { athleteMetrics } from '../src/features/metrics/metrics';

/**
 * The metrics query for an unattended test (`showable-version/05`, item 1).
 *
 * Read-only, no UI, no tester burden — the point is that these numbers cost the
 * people trying the app nothing. Run it, read it, and it tells you whether the
 * thing the product is actually claiming is happening:
 *
 *     npm run metrics
 *
 * **Coach Engagement Rate** is the one to read first. `CONTEXT.md` calls it the
 * primary engagement health metric, and it is the difference between an athlete
 * treating the Coach as a coaching relationship and one passively receiving a
 * plan. A high reflection-completion rate with a low engagement rate is
 * compliance, not the product working.
 *
 * Prints opaque athlete ids and nothing else. There is deliberately no way to
 * turn a row here into a person without going to the database yourself —
 * identity is separated from training data (ADR 0006), and a metrics report is
 * not a good reason to rejoin them.
 *
 * No dashboard, on purpose: this is for reading.
 */

/** `0.667` / `—`, so an absent ratio never reads as a zero. */
function pct(rate: number | null): string {
  return rate === null ? '   —  ' : `${(rate * 100).toFixed(0).padStart(4)}% `;
}

function num(value: number | null): string {
  return value === null ? '  — ' : value.toFixed(1).padStart(4);
}

async function main() {
  const ids = await getAllAthleteIds();

  if (ids.length === 0) {
    console.log('No athletes in this database.');
    return;
  }

  const rows = await Promise.all(
    ids.map(async (id) => athleteMetrics(await getMetricsInput(id))),
  );

  console.log('');
  console.log('Athlete metrics — one row per athlete, opaque ids only.');
  console.log(
    'engage counts a week with an athlete-sent Coach Chat turn, or one where ' +
      'they declined the proposed plan.',
  );
  console.log('');
  console.log(
    [
      'athlete'.padEnd(38),
      'engage'.padEnd(7),
      'wks'.padEnd(4),
      'ret>10d'.padEnd(8),
      'reflect'.padEnd(8),
      'skips'.padEnd(7),
      'moves/wk',
    ].join(' '),
  );
  console.log('-'.repeat(90));

  for (const m of rows) {
    console.log(
      [
        m.athleteId.padEnd(38),
        pct(m.coachEngagement.rate),
        String(m.coachEngagement.activeWeeks).padStart(3).padEnd(4),
        (m.retention.pastDay10 ? `yes ${m.retention.spanDays}d` : `no  ${m.retention.spanDays}d`).padEnd(8),
        pct(m.reflectionCompletion.rate),
        pct(m.skips.rate),
        num(m.movesPerWeek),
      ].join(' '),
    );
  }

  console.log('');
  console.log(
    `${rows.length} athlete(s). engage = Coach Engagement Rate over active training weeks.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
