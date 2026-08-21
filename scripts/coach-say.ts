import '../src/db/load-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWeeklyContext, renderWeeklyPrompt, buildChatPrompt } from '../src/features/coach/prompts';
import { callCoach } from '../src/features/coach/coach-client';
import { toApiMessages } from '../src/features/coach/conversation';
import type { Message } from '../src/features/coach/conversation';
import type { CheckIn } from '../src/features/coach/check-in';

/**
 * What does the Coach actually say?
 *
 * Every other check in this repo asks whether the code is correct. None of them
 * asks the only question that matters for a coaching product: does the Coach
 * still sound like a coach. A prompt change can pass lint, types, tests and the
 * golden snapshots and still make the Coach worse, because the thing it changed
 * lives in the model's reply, not in the string we sent.
 *
 * So: this renders a prompt for a **fixed, invented athlete**, sends it to the
 * real Anthropic API, and writes the reply to a file. Run it before a prompt
 * change and after. Read the two replies side by side. That is the whole tool.
 *
 *     npm run coach:say -- --label before
 *     ...make the change...
 *     npm run coach:say -- --label after
 *
 * Deliberately NOT a test:
 *
 *   - It costs real API calls, so it must never run in `npm test`.
 *   - Replies vary run to run. There is no assertion that could be both
 *     meaningful and stable, and a flaky assertion is worse than none — it
 *     teaches you to ignore a red result.
 *   - The output is for a human to read. A machine cannot tell you whether the
 *     Coach sounds like a peer or like a chatbot; that judgement is the product.
 *
 * It is the cheap early half of the SAFE-3 eval suite (knowledge-oracle/06),
 * which is currently last in the route — meaning the grounding work would
 * otherwise be done with no way to see its effect until the very end. This gives
 * you eyes from the first commit. When the real eval arrives, this stays: the
 * eval will score, and this will still be how you read.
 *
 * No real athlete is involved. The fixture is invented, carries no name or
 * email, and passes through the same identifier assertion as production
 * (GDPR decision 1) — running this cannot send anyone's data anywhere.
 */

// ── The fixture ───────────────────────────────────────────────────────────────
//
// One athlete, fixed forever. The point is comparability: if the athlete changes
// between runs, the replies are not comparable and the tool is worthless. Change
// this only when you deliberately want a new baseline, and re-capture every
// scenario when you do.
//
// Shaped to exercise the interesting branches: mid-relationship (session 4+, so
// the full Reflective Prompt arc), a race target, real equipment, a Fixed
// Constraint, and a communication style that should be visible in the tone.
const FIXTURE: CheckIn = {
  body: 6,
  mental: 5,
  energy: 6,
  sleep: 6.5,
  pulse: 58,
  phase: 'Build',
  sessionCount: 8,
  commStyle: 'direct, technical, no reassurance',
  experienceLevel: 'intermediate',
  language: 'English',
  weeklySessionDay: 'Monday',
  fixedConstraints: ['Thursday'],
  weeklySessionNumber: 9,
  raceTarget: 'Ironman Copenhagen, 17 August 2027',
  equipment: [
    { id: 'e1', category: 'bike', name: 'Canyon Speedmax', details: 'CF SLX, Quarq power meter', addedDate: '2026-01-04' },
    { id: 'e2', category: 'watch', name: 'Garmin Fenix 8', details: null, addedDate: '2026-02-11' },
  ],
  onboarding: {
    sportBackground: 'running',
    availableHours: '13–16h',
    motivation: 'finish under 11 hours',
    weakestDiscipline: 'swim',
    hasHumanCoach: 'no',
  },
};

// A week that gives the Coach something to actually react to: a hard session
// that went badly, a good one, and a skip. A flat week produces a bland reply
// and tells you nothing about whether the Coach is reading the signals.
const WEEK_FEEDBACK = [
  { dateKey: '2026-08-11', sessionType: 'Intensity', body: 8, mind: 3, comment: 'legs never came around, cut the last interval' },
  { dateKey: '2026-08-13', sessionType: 'Endurance', body: 5, mind: 7, comment: 'easy and steady, felt good' },
  { dateKey: '2026-08-15', sessionType: 'Tempo', body: 7, mind: 5, comment: null },
];

const SKIPPED = [{ date: '2026-08-16', sessionType: 'Endurance' }];
const TODAY = '2026-08-17';

// ── The scenarios ─────────────────────────────────────────────────────────────

const SCENARIOS: { name: string; system: () => string; firstTurn: string }[] = [
  {
    name: 'weekly-session',
    system: () =>
      renderWeeklyPrompt(
        buildWeeklyContext(FIXTURE, WEEK_FEEDBACK, [], SKIPPED, [], null, TODAY),
      ),
    firstTurn: "Let's do our weekly session.",
  },
  {
    name: 'weekly-session-first-ever',
    // Session 1 is a different prompt and a different Coach posture — it must
    // not fake familiarity. Worth watching separately, because it is the one a
    // new tester meets first.
    system: () =>
      renderWeeklyPrompt(
        buildWeeklyContext(
          { ...FIXTURE, weeklySessionNumber: 1, sessionCount: 0 },
          [],
          [],
          [],
          [],
          null,
          TODAY,
        ),
      ),
    firstTurn: "Let's do our weekly session.",
  },
  {
    name: 'coach-chat',
    system: () => buildChatPrompt(FIXTURE, TODAY),
    // A training-science question on purpose: this is exactly the kind of claim
    // the Knowledge Oracle is meant to ground. Read this reply now, and read it
    // again after retrieval lands — the difference is the whole point of the RAG.
    firstTurn: 'How long should my taper be before Copenhagen, and what should I actually do in it?',
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const label = arg('label');
  if (!label) {
    console.error(
      'Usage: npm run coach:say -- --label <before|after|whatever>\n' +
        '\n' +
        'Renders the Coach prompts for a fixed athlete, calls the real API, and\n' +
        'writes each reply to .coach-say/<label>/. Run before and after a prompt\n' +
        'change, then read the two side by side.',
    );
    process.exit(1);
  }

  const only = arg('only');
  const scenarios = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenario named "${only}". Known: ${SCENARIOS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  // `label` becomes a directory name, so it must be exactly one safe path
  // segment. A local dev script is a low-stakes place for this, but writing
  // outside .coach-say/ is never what anyone meant by a label.
  if (!/^[A-Za-z0-9._-]+$/.test(label) || label === '.' || label === '..') {
    console.error(
      `Invalid --label "${label}". Use letters, digits, dot, dash or underscore — ` +
        'it becomes a directory name under .coach-say/.',
    );
    process.exit(1);
  }

  const outDir = join(process.cwd(), '.coach-say', label);
  mkdirSync(outDir, { recursive: true });

  for (const scenario of scenarios) {
    process.stdout.write(`${scenario.name} ... `);
    const system = scenario.system();
    const transcript: Message[] = [];

    let reply: string;
    try {
      reply = (
        await callCoach({
          system,
          messages: toApiMessages(transcript, scenario.firstTurn),
          maxTokens: 1400,
        })
      ).text;
    } catch (error) {
      // A failed call is a result worth keeping — "the Coach said nothing" is
      // exactly the kind of regression this tool exists to make visible.
      reply = `*** CALL FAILED ***\n\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
    }

    // The prompt is written out beside the reply on purpose. When two replies
    // differ you will immediately want to know whether the prompt differed, and
    // reconstructing it later means checking out the old commit.
    writeFileSync(join(outDir, `${scenario.name}.prompt.txt`), system, 'utf8');
    writeFileSync(join(outDir, `${scenario.name}.reply.txt`), reply, 'utf8');
    console.log(`${reply.length} chars`);
  }

  console.log(`\nWritten to .coach-say/${label}/`);
  console.log('Compare with a previous run, e.g.:');
  console.log(`  git diff --no-index .coach-say/before .coach-say/${label}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
