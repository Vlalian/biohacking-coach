'use client';

import { useTranslations } from 'next-intl';
import {
  blockPosition,
  currentBlock,
  type TrainingBlock,
} from '@/features/coach/training-blocks';

/**
 * The athlete's one-line read of their Training Blocks
 * (`training-architecture/07`): the block today falls inside, where in it they
 * stand, and how far the race is. Rendered above the calendar.
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

  return (
    <p className="w-full max-w-[1100px] font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
      <span className="text-foreground">{block.name}</span>
      {' · '}
      {t('weekOf', { week, weeks })}
      {' · '}
      {t('weeksToRace', { weeks: weeksToRace, race: race.name })}
    </p>
  );
}
