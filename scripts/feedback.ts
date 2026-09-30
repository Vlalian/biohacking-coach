import '../src/db/load-env';
import { getFeedbackReportInput } from '../src/features/feedback/feedback-report-repository';
import { renderFeedbackReport } from '../src/features/feedback/feedback-report';

/**
 * Everything testers have said through the escape hatch, printed
 * (`showable-version/07`).
 *
 *     npm run feedback
 *
 * The Feedback Interview exists to be read by a builder, and nothing in the app
 * reads it back: the Head Coach never sees it, the athlete never sees a score,
 * and the metrics report counts numbers, not words. So this is where the words
 * come out — every interview transcript with its Trust Signal beneath it, and
 * every fallback submission with the View it came from and, when the Coach
 * could not answer, why.
 *
 * Prints opaque athlete ids and nothing else (ADR 0006). Prints to stdout
 * deliberately, like `export.ts`: redirect it if you want a file, because a
 * transcript of what testers think left lying in the repo directory is exactly
 * the accident worth not enabling.
 */
async function main() {
  console.log(renderFeedbackReport(await getFeedbackReportInput()));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
