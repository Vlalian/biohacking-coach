'use client';

import { useTranslations } from 'next-intl';
import {
  blockPosition,
  currentBlock,
  type TrainingBlock,
} from '@/features/coach/training-blocks';

/**
 * The athlete's read of their Training Blocks
 * (`training-architecture/07`): the block today falls inside, where in it they
 * stand, and how far the race is. Rendered above the calendar as the export's
 * hype strip (iron-insight-grid, 2026-09-23; `training-architecture/38`): a
 * graphite band with the weeks to the race as the headline number, the block
 * name, and a progress bar through the block.
 *
 * **Read-only, with no control of any kind** (Mads, 2026-09-13). The athlete
 * sees the structure and touches none of it; challenging a block is a Coach
 * Chat conversation, and moving one is the Head Coach's (slice 08). The test
 * asserts the markup carries no button, input or form so that stays true.
 *
 * Renders nothing rather than a placeholder for an athlete with no race, no
 * blocks, or a day outside every block — an empty strip would be a claim.
 */
export function BlockStrip({
  todayKey,
  race,
  blocks,
}: {
  todayKey: string;
  race: { name: string; date: string } | null;
  blocks: TrainingBlock[];
}) {
  const t = useTranslations('BlockStrip');
  const block = race ? currentBlock(todayKey, blocks) : null;
  if (!race || !block) return null;

  const { week, weeks } = blockPosition(todayKey, block);
  const weeksToRace = Math.max(
    0,
    Math.floor(
      (new Date(`${race.date}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    ),
  );
  // Arithmetic, not judgement: how far through the block the week stands.
  const progress = weeks > 0 ? Math.min(100, Math.round((week / weeks) * 100)) : 0;

  return (
    <section className="w-full max-w-[1500px] overflow-hidden border-l-4 border-signal bg-primary px-6 py-5 text-primary-foreground">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <p className="flex items-baseline gap-3">
          <span className="font-display text-5xl font-bold italic leading-none text-signal">
            {weeksToRace}
          </span>
          <span className="font-body text-base uppercase tracking-[0.16em] text-primary-foreground">
            {t('weeksToRace', { weeks: weeksToRace, race: race.name })}
          </span>
        </p>
        <p className="flex items-baseline gap-3">
          <span className="font-display text-lg font-bold uppercase italic tracking-[0.04em]">
            {block.name}
          </span>
          <span className="font-body text-sm uppercase tracking-[0.14em] text-primary-foreground">
            {t('weekOf', { week, weeks })}
          </span>
        </p>
      </div>
      <div className="mt-4 h-2 w-full bg-primary-foreground/15" aria-hidden="true">
        <div className="h-full bg-signal" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
