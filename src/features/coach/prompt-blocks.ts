import type { EquipmentCategory, EquipmentItem } from '@/features/equipment/equipment';
import type { Onboarding } from './check-in';

/**
 * How a Coach system prompt is put together.
 *
 * Every prompt in this feature — the Weekly Session, Coach Chat, the Coach
 * Briefing — is a sequence of sections separated by a blank line, most of them
 * conditional on their data existing. This module owns that model and the
 * sections more than one prompt shares, so the prompts themselves become lists
 * of blocks rather than one long template literal with conditionals inside it.
 *
 * Pure: plain data in, strings out. No DB, no HTTP, no Anthropic client.
 */

// ── Onboarding & equipment lines ──────────────────────────────────────────────

const joinValue = (v: string | string[] | null | undefined): string =>
  Array.isArray(v) ? v.join(', ') : (v ?? '');

/**
 * Lines describing what the athlete already answered in the onboarding
 * questionnaire. Injected into every Coach prompt so the Coach builds on these
 * instead of re-asking.
 */
export function buildOnboardingLines(onboarding?: Onboarding | null): string[] {
  const lines: string[] = [];
  if (!onboarding) return lines;
  if (onboarding.sportBackground)
    lines.push(`Sport background: ${joinValue(onboarding.sportBackground)}`);
  // A budget, not an observation: this is the ceiling the week is planned
  // within, so it is phrased as capacity rather than as a fact about what the
  // athlete has been doing. Asked of every experience level.
  //
  // The parenthetical is not padding. `npm run coach:say` on 2026-08-21 showed
  // the model reading the bare "Training time available: 13–16h per week" as
  // current volume — "you carry higher weekly volume (13-16h)" — which is the
  // exact confusion the rename from `weeklyHours` existed to end. The intent
  // was documented in this comment and nowhere the model could see it. Now the
  // string says what it means.
  if (onboarding.availableHours)
    lines.push(
      `Time available to train: ${onboarding.availableHours} per week ` +
        `(a ceiling to plan within — not what they currently do)`,
    );
  if (onboarding.motivation) lines.push(`Motivation: ${onboarding.motivation}`);
  if (onboarding.bestTime) lines.push(`Best Ironman time: ${onboarding.bestTime}`);
  if (onboarding.weakestDiscipline)
    lines.push(`Weakest discipline: ${joinValue(onboarding.weakestDiscipline)}`);
  if (onboarding.hasHumanCoach)
    lines.push(`Works with a human coach: ${onboarding.hasHumanCoach}`);
  if (onboarding.targetTime) lines.push(`Target time: ${onboarding.targetTime}`);
  if (onboarding.trackedMetrics)
    lines.push(`Tracks metrics: ${joinValue(onboarding.trackedMetrics)}`);
  return lines;
}

// ── Block composition ─────────────────────────────────────────────────────────

/**
 * One section of a system prompt, or nothing.
 *
 * Every Coach prompt is a sequence of sections separated by a blank line, and
 * most sections are conditional on their data existing. Modelling that directly
 * — a list of `string | null`, joined — is what lets a new section be *added to
 * a list* instead of threaded into a nested ternary inside a template literal.
 *
 * That matters beyond tidiness. The Knowledge Oracle adds a grounding section
 * carrying retrieved passages and their citations to the Weekly Session prompt,
 * to Coach Chat, and to plan generation (the SAFE-3 grounding requirement). With
 * this model
 * that is one `groundingBlock()` appearing in three lists. Without it, it was
 * three hand-edits into three different nested conditionals, each with its own
 * whitespace to get right — and prompt whitespace is not self-checking.
 */
export type PromptBlock = string | null;

/**
 * Joins the sections that have something to say with a blank line between them.
 * Empty and whitespace-only sections drop out, so a builder may return `''` as
 * freely as `null`.
 */
export function assemble(blocks: PromptBlock[]): string {
  return blocks.filter((b): b is string => b !== null && b.trim() !== '').join('\n\n');
}

/** A headed section: a title line followed by its lines; null when there are none. */
export function block(heading: string, lines: string[]): PromptBlock {
  if (lines.length === 0) return null;
  return `${heading}\n${lines.join('\n')}`;
}

// ── Blocks shared by more than one prompt ─────────────────────────────────────

const ONBOARDING_HEADING =
  'ONBOARDING PROFILE (athlete already answered these at onboarding — build on them, NEVER ask for this information again):';

/** What the athlete already told us at onboarding, as bullets. */
export function onboardingBlock(onboarding?: Onboarding | null): PromptBlock {
  return block(
    ONBOARDING_HEADING,
    buildOnboardingLines(onboarding).map((l) => `- ${l}`),
  );
}

export function equipmentBlock(equipmentLines: string[]): PromptBlock {
  return block('EQUIPMENT:', equipmentLines);
}

export function commStyleBlock(commStyle?: string): PromptBlock {
  return commStyle ? `COMM STYLE: ${commStyle}` : null;
}

/**
 * The opening identity line, with the language directive spliced in exactly
 * where it has always sat — inside the first sentence, before the prompt names
 * which conversation this is.
 */
export function openingBlock(language: string | undefined, role: string): string {
  return `You are Coach in a luxury Ironman training app.${languageDirective(language)} ${role}`;
}

const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  bike: 'Bike',
  shoes: 'Shoes',
  watch: 'Watch',
  other: 'Other',
};

export function buildEquipmentLines(equipment?: EquipmentItem[]): string[] {
  if (!equipment || equipment.length === 0) return [];
  return equipment.map((item) => {
    const detail = item.details ? ` — ${item.details}` : '';
    return `${EQUIPMENT_CATEGORY_LABEL[item.category]}: ${item.name}${detail}`;
  });
}

// ── Language directive ────────────────────────────────────────────────────────

const SPORTS_TERMS =
  'RPE, FTP, CSS, Zone 1-5, Ironman, 70.3, brick, tempo, threshold, VO2max, CTL, ATL, TSB, HRV, watts, TSS';

// The Coach appends these machine-readable signals on the last line; the app
// strips them before showing the message. Shared verbatim by the Weekly Session
// and Coach Chat prompts so the two can never drift.
export const CONSTRAINT_SIGNALS = `CONSTRAINT SIGNALS (append on last line, stripped by app):
Specific date blocked → [UNAVAILABLE:YYYY-MM-DD]
Ambiguous ("can't do Tuesdays") → ask "just this week or every week?" first
Every [day] → [FIXED_CONSTRAINT_ADD:DayName]
Day unblocked → [FIXED_CONSTRAINT_REMOVE:DayName]
No justification needed.`;

/**
 * The Coach responds in the athlete's language, but technical sports terms stay
 * English (route: Athlete Language). Empty directive for English or unknown.
 */
export function languageDirective(language?: string): string {
  if (!language || language === 'English' || language === 'en') return '';
  if (language === 'Dansk' || language === 'da') {
    return `\nLANGUAGE: Respond in Danish. The following terms always stay in English: ${SPORTS_TERMS}.\n`;
  }
  return '';
}
