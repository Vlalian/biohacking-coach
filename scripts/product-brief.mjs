/**
 * Generates `src/features/feedback/product-brief.generated.ts` — what the
 * Feedback Interview is told about the app (`showable-version/58`).
 *
 * The interviewer relates a tester's complaint to the real feature and asks a
 * sharper question when it knows what the app is. That knowledge lives in the
 * private docs repo, which the app cannot read at runtime, so this script
 * condenses it into a checked-in module. Two inputs, both in the docs repo:
 *
 * - `CONTEXT-BRIEF.md`: the glossary index. Only the product terms in
 *   {@link BRIEF_TERMS} are kept, one line each, in the name the tester knows
 *   the Coach by (Momentum).
 * - `.scratch/post-testing/planned-features.md`: Mads's short, hand-kept list
 *   of planned features, one `- **Name**: what it is.` line each.
 *
 * Run from the code repo root after either changes, and commit the result:
 *
 *     node scripts/product-brief.mjs <docs-root>
 *
 * Nothing about any athlete or tester may reach the prompt. The sources hold
 * none today; a line carrying an email address or a phone number is dropped
 * all the same, and `product-brief.generated.test.ts` checks the output.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The glossary terms the interviewer is given, in the order a tester meets
 * them. Chosen from what is built, in words a tester would recognise. Left out
 * on purpose: internal machinery (Privacy Proxy, Seed Template, Knowledge
 * Oracle), metrics, retired rituals (the Weekly Session), anything still only
 * planned (that is the planned-features list's job), and Check-in, whose
 * one-liner still calls it a phase of the retired Weekly Session. Coach Chat
 * (the same, and the Coach Overlay line covers it) and Panel (the Information
 * View line covers it) are left out to keep the brief under its cap.
 */
const BRIEF_TERMS = [
  'Target Athlete',
  'Onboarding Session',
  'First Week Plan',
  'Training Plan',
  'Week Plan',
  'Planned Session',
  'Session Type',
  'Session Move',
  'Athlete Session',
  'Session Drawer',
  'Session Feedback Prompt',
  'Session Reflection',
  'Body Feedback',
  'Mind Feedback',
  'RPE (Rate of Perceived Exertion)',
  'Coach Overlay',
  'Training Block',
  'Training Phase',
  'Race',
  'Target Race',
  'Injury',
  'Illness',
  'Leave',
  'Unavailable',
  'History Upload',
  'Detected Activity',
  'Information View',
  'Glossary',
  'Navigation Drawer',
  'Head Coach',
];

/** The prompt budget for the brief, in characters. The script refuses to write a bigger one. */
const BRIEF_CAP = 4000;

/** An email address, an international number, or a run of eight digits: personal data, never prompt text. */
const PERSONAL = /@|\+\d|\d(?:[\s-]?\d){7,}/;

/** A planned-features item: `- **Name**: what it is.` */
const PLANNED_ITEM = /^- \*\*([^*]+)\*\*:\s*(.*\S)/;

/** Internal provenance in a parenthesis: a decision date, a file path, an ADR. */
const PROVENANCE = /\d{4}-\d{2}-\d{2}|`|\bADR\b/i;

/** `- **Term** — definition` lines out of the brief, as a map from term to definition. */
function glossaryLines(markdown) {
  const out = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    // `(.*\S)` ends on the last visible character, so trailing space never lands.
    const m = line.match(/^- \*\*([^*]+)\*\* — (.*\S)/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * One definition, readable by someone outside the team: provenance dropped,
 * emphasis dropped, a capped run-on cut back to its first clause, and the Coach
 * called Momentum. "Head Coach" is a different person and keeps its name; so
 * does a named surface ("Coach Overlay").
 */
function plainDefinition(definition) {
  let text = definition
    .replace(/\s*\*?\([^()]*\)\*?/g, (m) => (PROVENANCE.test(m) ? '' : m))
    .replace(/\*\*|`/g, '')
    .replace(/\*/g, '');
  if (text.endsWith('…')) text = `${text.split(/ — |;/)[0]}.`;
  return text
    .trim()
    .replace(/\b[Tt]he (?:AI )?Coach\b/g, 'Momentum')
    .replace(/(?<!Head )\bCoach\b(?! [A-Z])/g, 'Momentum');
}

// Export-for-test: the script's interface is its CLI, and running that rewrites the
// checked-in module. `main` is the non-test caller.
/** The {@link BRIEF_TERMS} the source does not define — a rename there, to be fixed here. */
export function missingTerms(contextBrief) {
  const have = glossaryLines(contextBrief);
  return BRIEF_TERMS.filter((term) => !have.has(term));
}

// Export-for-test: the script's interface is its CLI, and running that rewrites the
// checked-in module. `main` is the non-test caller.
/** The chosen terms as `Term: definition` lines, joined by newlines. */
export function condenseBrief(contextBrief) {
  return briefEntries(contextBrief)
    .filter(({ line }) => !PERSONAL.test(line))
    .map(({ line }) => line)
    .join('\n');
}

// Export-for-test: the script's interface is its CLI, and running that rewrites the
// checked-in module. `main` is the non-test caller.
/**
 * The chosen terms {@link condenseBrief} dropped for carrying personal data. Named by
 * term, a fixed constant, so the report never repeats what the filter kept out.
 */
export function personalTerms(contextBrief) {
  return briefEntries(contextBrief)
    .filter(({ line }) => PERSONAL.test(line))
    .map(({ term }) => term);
}

/** Each chosen term the source defines, with its brief line. */
function briefEntries(contextBrief) {
  const have = glossaryLines(contextBrief);
  return BRIEF_TERMS.filter((term) => have.has(term)).map((term) => ({
    term,
    line: `${term}: ${plainDefinition(have.get(term))}`,
  }));
}

// Export-for-test: the script's interface is its CLI, and running that rewrites the
// checked-in module. `main` is the non-test caller.
/** `- **Name**: what it is.` items out of the planned-features list, as `Name: what it is.` */
export function plannedFeaturesFrom(markdown) {
  const out = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(PLANNED_ITEM);
    if (m && !PERSONAL.test(line)) out.push(`${m[1]}: ${m[2]}`);
  }
  return out;
}

// Export-for-test: the script's interface is its CLI, and running that rewrites the
// checked-in module. `main` is the non-test caller.
/** The 1-based source line of each planned item {@link plannedFeaturesFrom} dropped for personal data. */
export function personalPlannedLines(markdown) {
  const out = [];
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (PLANNED_ITEM.test(line) && PERSONAL.test(line)) out.push(i + 1);
  });
  return out;
}

function literalArray(lines) {
  return ['[', ...lines.map((l) => `  ${JSON.stringify(l)},`), '];'].join('\n');
}

// Export-for-test: the script's interface is its CLI, and running that rewrites the
// checked-in module. `main` is the non-test caller.
/** The source of the generated module. */
export function renderGeneratedModule(brief, plannedFeatures) {
  return [
    '// Generated by scripts/product-brief.mjs — do not edit.',
    '// Regenerate from the code repo root with `node scripts/product-brief.mjs <docs-root>`, where',
    '// <docs-root> is the private docs repo. Sources there: CONTEXT-BRIEF.md and',
    '// .scratch/post-testing/planned-features.md.',
    '',
    '/** What the app is, one product term per line, for the Feedback Interview (showable-version/58). */',
    `export const PRODUCT_BRIEF: readonly string[] = ${literalArray(brief.split('\n'))}`,
    '',
    '/** Features that are planned, not built. The interviewer never raises these first. */',
    `export const PLANNED_FEATURES: readonly string[] = ${literalArray(plannedFeatures)}`,
    '',
  ].join('\n');
}

function main(argv) {
  if (!argv[2]) {
    console.error('product-brief: pass the private docs repo as the argument.');
    process.exit(1);
  }
  const root = resolve(argv[2]);
  const briefPath = join(root, 'CONTEXT-BRIEF.md');
  const plannedPath = join(root, '.scratch', 'post-testing', 'planned-features.md');
  for (const p of [briefPath, plannedPath]) {
    if (!existsSync(p)) {
      console.error(`product-brief: ${p} not found — pass the private docs repo as the argument.`);
      process.exit(1);
    }
  }
  const contextBrief = readFileSync(briefPath, 'utf8');
  const missing = missingTerms(contextBrief);
  if (missing.length > 0) {
    console.error(`product-brief: CONTEXT-BRIEF.md no longer defines ${missing.join(', ')} — update BRIEF_TERMS.`);
    process.exit(1);
  }
  const personal = personalTerms(contextBrief);
  if (personal.length > 0) {
    console.error(`product-brief: the definition of ${personal.join(', ')} looks like personal data and was left out — fix it in CONTEXT.md or drop the term from BRIEF_TERMS.`);
    process.exit(1);
  }
  const brief = condenseBrief(contextBrief);
  if (brief.length >= BRIEF_CAP) {
    console.error(`product-brief: the brief is ${brief.length} chars, over the ${BRIEF_CAP} cap — choose fewer terms.`);
    process.exit(1);
  }
  const plannedSource = readFileSync(plannedPath, 'utf8');
  const planned = plannedFeaturesFrom(plannedSource);
  const skipped = personalPlannedLines(plannedSource);
  if (skipped.length > 0) {
    console.warn(`product-brief: left out planned-features.md line ${skipped.join(', ')}: it looks like personal data.`);
  }
  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'features', 'feedback', 'product-brief.generated.ts');
  writeFileSync(outPath, renderGeneratedModule(brief, planned), 'utf8');
  console.log(`product-brief: wrote ${outPath} — ${brief.split('\n').length} terms (${brief.length} chars), ${planned.length} planned features`);
}

// Only when run as a script: the pure functions above are importable by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
