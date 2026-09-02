import '../src/db/load-env';
import {
  getExportInput,
  getUserIdForAthlete,
} from '../src/features/erasure/export-repository';
import { toAthleteExport } from '../src/features/erasure/export';
import { getAthleteById } from '../src/features/athlete/athlete-repository';

/**
 * One athlete's data export, printed (`showable-version/10`).
 *
 * The command-line twin of the download route, sharing the same reads and the
 * same document builder — so "what does the app hold about me" has one answer
 * rather than two that can drift.
 *
 *     npm run export -- <athlete-id>
 *
 * Two reasons it exists alongside the button. First, the obligation: Articles 15
 * and 20 require a controller to *fulfil* a request, and for a handful of known
 * testers that can be done by running this and sending the file — the button is
 * the nicer way, not the required one.
 *
 * Second, and the reason to keep it after the button exists: it is how the
 * erasure gets verified against a real database. Export the athlete, erase them,
 * export again, and the second run should find nothing. That is the live half of
 * PRIV-3's fit criterion, which no test in this repository can stand in for —
 * there is no test database here.
 *
 * Prints to stdout deliberately. Redirect it if you want a file; the script does
 * not write one, because a health-adjacent export left lying in the repo
 * directory is exactly the accident worth not enabling.
 */
async function main() {
  const athleteId = process.argv[2];

  if (!athleteId) {
    console.error('Usage: npm run export -- <athlete-id>');
    process.exitCode = 1;
    return;
  }

  if (!(await getAthleteById(athleteId))) {
    console.error(`No athlete with id ${athleteId}.`);
    process.exitCode = 1;
    return;
  }

  // Null for a synthetic athlete, which has no login and so no name or email to
  // return — the export is simply account-less for them.
  const userId = await getUserIdForAthlete(athleteId);
  const input = await getExportInput(athleteId, userId ?? '');

  console.log(JSON.stringify(toAthleteExport(input, new Date()), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
