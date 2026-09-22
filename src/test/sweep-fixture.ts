/**
 * A fixture for `source-sweep.test.ts`, and nothing else.
 *
 * The sweep's comment stripping has to be asserted against a file whose exact
 * shape the assertions know: a block comment with no space around it, a line
 * comment, and a phrase that exists only in prose. Using the test file itself
 * made the fixture and the assertions the same text, which is how a guard ends
 * up passing because it matched its own description. sweepFixtureProseOnly.
 */
export const sweepFixtureTight = 'sweepFixtureLeft'/* tight */+'sweepFixtureRight';

export const sweepFixtureLine = 'kept'; // sweepFixtureLineComment

export const SWEEP_FIXTURE_NAME = 'test/sweep-fixture.ts';
