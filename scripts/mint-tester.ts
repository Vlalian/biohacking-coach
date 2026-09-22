import '../src/db/load-env';
import { main } from './tester-kit/cli';

// The entry point, and nothing else. `tester-kit/cli.ts` holds the run so a
// test can import it without this line reaching a database.
main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
