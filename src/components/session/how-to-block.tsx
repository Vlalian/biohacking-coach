'use client';

import { useTranslations } from 'next-intl';
import type { HowToView } from '@/features/session/how-to';

/**
 * A session's how-to, read-only (`training-architecture/26`): the segments in
 * order, each with its minutes, zone and what to do; the focus cues; and
 * Momentum's one cue, marked as Momentum's. When the Head Coach wrote it, it
 * says so instead.
 *
 * Shared by the Session Drawer and the Head Coach's review of a draft, so the
 * athlete and the coach read the same thing. No list items: the review's
 * cards are list items themselves.
 */
export function HowToBlock({ howTo }: { howTo: HowToView }) {
  const t = useTranslations('HowTo');
  return (
    <div className="space-y-3" data-how-to={howTo.byCoach ? 'coach' : 'template'}>
      <div className="space-y-1.5">
        {howTo.segments.map((segment, i) => (
          <div key={i} className="border-l-2 border-border pl-3" data-segment={segment.name}>
            <p className="font-body text-[15px] text-foreground">
              <span className="font-semibold">{t(segment.name)}</span>
              {' · '}
              {segment.minutes} {t('minutes')}
              {' · '}
              {segment.zone}
            </p>
            {segment.detail && <p className="font-body text-sm text-muted-foreground">{segment.detail}</p>}
          </div>
        ))}
      </div>
      {howTo.focus.length > 0 && (
        <div>
          <p className="font-body text-[13px] uppercase tracking-[0.16em] text-muted-foreground">{t('focus')}</p>
          {howTo.focus.map((cue, i) => (
            <p key={i} className="font-body text-[15px] leading-relaxed text-foreground" data-focus>
              {cue}
            </p>
          ))}
        </div>
      )}
      {howTo.cue && (
        <p className="font-body text-[15px] leading-relaxed text-foreground" data-momentum-cue>
          <span className="font-body text-[13px] uppercase tracking-[0.16em] text-signal">{t('momentumCue')}</span>{' '}
          {howTo.cue}
        </p>
      )}
      {howTo.byCoach && (
        <p className="font-body text-[13px] uppercase tracking-[0.16em] text-muted-foreground">{t('byCoach')}</p>
      )}
    </div>
  );
}
