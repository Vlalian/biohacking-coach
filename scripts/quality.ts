import { main } from './quality/cli';

// The entry point, and nothing else. `cli.ts` holds the orchestration so it can
// be imported by a test without this line ending the test run.
process.exit(main());
