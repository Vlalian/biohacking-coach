import '../src/db/load-env';
import { main } from './personas/retire-cli';

// The entry point, and nothing else. `retire-cli.ts` holds the run so a test
// can import it without this line reaching a database.
main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});
