import type { BriefingContext } from './briefing';

/**
 * What reached one Coach Briefing prompt, counted (showable-version/19).
 *
 * The question the ticket asks — is a short briefing a quiet athlete or an
 * artifact — cannot be answered by reading the output, only by putting the
 * input beside it. These are the input's numbers; `scripts/briefing-length.ts`
 * prints them for the personas and puts the model's reply beside them.
 */
export interface BriefingInputStats {
  /** Plan rows the prompt lists (every session, no window — the service applies no cap). */
  sessions: number;
  /** Of those, sessions the athlete skipped. */
  skipped: number;
  /** Session Reflections the prompt lists; 0 when reports are withheld. */
  reflections: number;
  /** Of those, reflections with a free-text comment. */
  withComment: number;
  /** The rendered system prompt's size. */
  promptChars: number;
  /** A rough token count (four characters a token); the script prints the API's exact count beside it. */
  promptTokensApprox: number;
  /** The Training Block today falls inside, or null. */
  block: string | null;
}

export function briefingInputStats(ctx: BriefingContext, prompt: string): BriefingInputStats {
  const reflections = ctx.reports?.reflections ?? [];
  return {
    sessions: ctx.plan.length,
    skipped: ctx.plan.filter((s) => s.status === 'skipped').length,
    reflections: reflections.length,
    // Truthy, as the renderer decides it (`briefing.ts`: an empty comment renders nothing).
    withComment: reflections.filter((r) => !!r.comment).length,
    promptChars: prompt.length,
    promptTokensApprox: Math.ceil(prompt.length / 4),
    block: ctx.blocks?.phase ?? null,
  };
}

/**
 * The Neon branch `scripts/briefing-length.ts` measures. Production is refused
 * by name (GDPR decision 8: real athletes' data is reached only by the Vercel
 * production environment); the default is `seed-template`, where the personas
 * live. The script resolves the branch to a connection string itself, so
 * whatever `DATABASE_URL` says is never what it reads.
 */
export function branchToMeasure(name: string | undefined): string {
  const branch = name || 'seed-template';
  if (branch.toLowerCase() === 'production') {
    throw new Error('briefing-length never reads production; pass --branch seed-template (the default).');
  }
  return branch;
}
