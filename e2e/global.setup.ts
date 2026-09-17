import { execFileSync } from 'node:child_process';

/**
 * Reseeds the suite's own database before every run (frontend-quality/07).
 * `scripts/seed.ts` converges on re-run, so the rows the pictures start from
 * are the same every time, whatever the last run or a stray click left behind.
 */
export default function globalSetup(): void {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error('E2E_DATABASE_URL is not set');
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
}
