import '../src/db/load-env';
import { getFeedbackReportInput } from '../src/features/feedback/feedback-report-repository';
import { feedbackReport } from './feedback-args';

/**
 * Everything testers have said, printed (`showable-version/07`, `48`, `58`).
 *
 *     npm run feedback
 *     npm run feedback -- --since 2026-09-30
 *
 * The comment field, interviews and Trust Signals, thumbs on Momentum's
 * messages and Session Reflection comments, each with the key
 * `/feedback-review`'s ledger uses. `--since` keeps only what was written on or
 * after that day.
 *
 * Feedback exists to be read by a builder, and nothing in the app reads it
 * back: the Head Coach never sees it, the athlete never sees a score, and the
 * metrics report counts numbers, not words. So this is where the words come
 * out.
 *
 * Prints opaque athlete ids and nothing else (ADR 0006). Prints to stdout
 * deliberately, like `export.ts`: redirect it if you want a file, because a
 * transcript of what testers think left lying in the repo directory is exactly
 * the accident worth not enabling.
 */
// Stryker disable next-line all — the process edge: argv in, stdout out. What it decides is feedbackReport's, tested in feedback-args.test.ts
feedbackReport(process.argv.slice(2), getFeedbackReportInput).then(console.log).catch((error) => {
  // Stryker disable next-line all — the process edge: a failure is printed and the exit code set, nothing decided
  console.error(error);
  process.exitCode = 1;
});
