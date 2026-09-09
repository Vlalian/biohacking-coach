'use client';

import { MessageThumbs } from './message-thumbs';
import { CitationList } from './citation-list';
import type { UiMessage } from './weekly-session';

/**
 * What hangs below a Coach turn: the sources it drew on, and the tester's
 * thumbs.
 *
 * Both surfaces that render a Coach message — Coach Chat and the Weekly Session
 * — showed exactly this, written out twice down to the four label keys. The two
 * are deliberately visually identical (see the note at the top of `coach-chat`),
 * so a change to one that missed the other would be a bug rather than a
 * variation, and the duplicate was the only thing keeping them in step.
 *
 * `t` is passed in rather than resolved here because the two callers read from
 * different namespaces — `CoachChat` and `WeeklySession` — which each carry
 * their own copy of these five keys. Taking the function keeps this component
 * out of that decision.
 *
 * The thumbs are for `coach_ai` only. A Head Coach turn is a person speaking,
 * and rating it is not feedback on the app.
 */
export function CoachMessageFooter({
  message,
  t,
}: {
  message: UiMessage;
  t: (key: string) => string;
}) {
  return (
    <>
      <CitationList citations={message.citations} heading={t('drewOn')} />
      {message.role === 'coach_ai' && (
        <MessageThumbs
          messageId={message.id}
          initial={message.rating ?? null}
          labels={{
            up: t('thumbUp'),
            down: t('thumbDown'),
            commentPlaceholder: t('thumbComment'),
            save: t('thumbSave'),
          }}
        />
      )}
    </>
  );
}
