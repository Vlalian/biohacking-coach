import '../src/db/load-env';
import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db';
import { athlete } from '../src/db/schema';
import { BRIEFING_OPENER, renderBriefingPrompt } from '../src/features/coach/briefing';
import { BRIEFING_MAX_TOKENS, buildBriefingContextFor } from '../src/features/coach/briefing-service';
import { branchToMeasure, briefingInputStats } from '../src/features/coach/briefing-stats';
import { COACH_MODEL } from '../src/features/coach/coach-client';
import { today as todayKey } from '../src/lib/date';

/**
 * Is a short Coach Briefing a quiet athlete, or an artifact? (showable-version/19)
 *
 * For each persona named, this builds the briefing prompt exactly as the
 * service does — same reads, same gates, same render — and prints what went
 * in: plan rows, skips, reflections, comments, prompt size. With `--call` it
 * then sends that prompt once, as the briefing would, and prints what came
 * back beside it: words, sentences, the API's own token counts and the
 * `stop_reason`. A `max_tokens` stop is the artifact the ticket is looking for.
 *
 *     npm run briefing:length                          # inputs only, no API call
 *     npm run briefing:length -- --call                # plus one Claude call per persona
 *     npm run briefing:length -- --branch dev/afk "Alex Rivera"
 *
 * Reads only. It resolves the Neon branch to a connection string itself (the
 * default is `seed-template`, where the personas live) and refuses `production`
 * by name; whatever `.env.local` says is never what it reads. Nothing is
 * written: no conversation row, no message. The decisions live in
 * `briefing-stats.ts`, where they are tested; this file only reads and prints.
 */

const NEON_PROJECT = 'plain-sky-06454855';
const NEON_ORG = 'org-patient-wave-37211297';
const DEFAULT_PERSONAS = ['Alex Rivera', 'Sam Chen'];

interface Args {
  names: string[];
  branch: string;
  call: boolean;
  today: string;
}

function parseArgs(argv: string[]): Args {
  const names: string[] = [];
  let branch: string | undefined;
  let call = false;
  let today = todayKey();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--call') call = true;
    else if (a === '--branch') branch = argv[++i];
    else if (a === '--today') today = argv[++i];
    else names.push(a);
  }
  return { names: names.length > 0 ? names : DEFAULT_PERSONAS, branch: branchToMeasure(branch), call, today };
}

/** The connection string for a branch, from the Neon CLI — never from the env file. */
function connectionStringFor(branch: string): string {
  if (!/^[\w./-]+$/.test(branch)) throw new Error(`Not a branch name: ${branch}`);
  const out = execSync(
    `neon connection-string ${branch} --pooled --project-id ${NEON_PROJECT} --org-id ${NEON_ORG}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ).trim();
  if (!out.startsWith('postgresql://')) throw new Error(`Could not resolve branch ${branch} (is 'neon login' done?)`);
  return out;
}

async function athleteIdFor(label: string): Promise<string> {
  const rows = await getDb().select({ id: athlete.id }).from(athlete).where(eq(athlete.syntheticLabel, label)).limit(1);
  if (!rows[0]) throw new Error(`No synthetic athlete labelled "${label}" on this branch (seed with --with-personas).`);
  return rows[0].id;
}

/** The tester's real link shape: reports shared, transcripts not. */
const linkFor = (athleteId: string) => ({
  id: 'briefing-length',
  coachId: 'briefing-length',
  athleteId,
  status: 'active' as const,
  visibility: { shareAthleteReports: true, shareAiTranscripts: false },
});

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim()).length;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.env.DATABASE_URL = connectionStringFor(args.branch);
  console.log(`branch ${args.branch} · today ${args.today} · model ${COACH_MODEL} · max_tokens ${BRIEFING_MAX_TOKENS}\n`);
  console.log('| athlete | block | sessions | skipped | reflections | with comment | prompt chars | ~tokens |');
  console.log('|---|---|---|---|---|---|---|---|');

  const prompts: { label: string; prompt: string }[] = [];
  for (const label of args.names) {
    const ctx = await buildBriefingContextFor(linkFor(await athleteIdFor(label)), args.today);
    const prompt = renderBriefingPrompt(ctx);
    const s = briefingInputStats(ctx, prompt);
    console.log(
      `| ${label} | ${s.block ?? '—'} | ${s.sessions} | ${s.skipped} | ${s.reflections} | ${s.withComment} | ${s.promptChars} | ${s.promptTokensApprox} |`,
    );
    prompts.push({ label, prompt });
  }

  if (!args.call) return;

  const client = new Anthropic();
  console.log('\n| athlete | stop_reason | input tokens | output tokens | words | sentences |');
  console.log('|---|---|---|---|---|---|');
  const replies: { label: string; text: string }[] = [];
  for (const { label, prompt } of prompts) {
    const reply = await client.messages.create({
      model: COACH_MODEL,
      max_tokens: BRIEFING_MAX_TOKENS,
      system: prompt,
      messages: [{ role: 'user', content: BRIEFING_OPENER }],
      // Inference stays in the US on every call (slice 15 / GDPR), as coach-client.ts does.
      inference_geo: 'us',
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = reply.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    console.log(
      `| ${label} | ${reply.stop_reason} | ${reply.usage.input_tokens} | ${reply.usage.output_tokens} | ${words(text)} | ${sentences(text)} |`,
    );
    replies.push({ label, text });
  }
  for (const { label, text } of replies) console.log(`\n=== ${label}\n${text}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
