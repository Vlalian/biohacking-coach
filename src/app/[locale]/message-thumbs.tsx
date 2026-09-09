'use client';

import { useState, useTransition } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { MessageRating } from '@/db/schema';
import { clearMessageRatingAction, rateMessageAction } from './message-feedback-actions';

/**
 * The tester's thumbs on one Coach message (`showable-version/05`, item 3).
 *
 * The artifact-pinning half of the feedback instrumentation: testers try the app
 * unattended, so nobody can ask "what just happened?" — and a flag pinned to a
 * message id opens the transcript at the exact text afterwards. The thumbs say
 * *where*; the Feedback Interview says *why*.
 *
 * **Never a score.** No count, no average, nothing aggregated is shown back, and
 * nothing here is visible to a Head Coach. What the tester sees is only their own
 * mark on their own message.
 *
 * The optional one-line comment appears *after* a rating is chosen rather than
 * beside it. A box that is always open asks for prose the tester did not come to
 * write, and the thumbs are meant to cost a second.
 */
export function MessageThumbs({
  messageId,
  initial,
  labels,
}: {
  messageId: string;
  initial: { rating: MessageRating; comment: string | null } | null;
  labels: { up: string; down: string; commentPlaceholder: string; save: string };
}) {
  const [rating, setRating] = useState<MessageRating | null>(initial?.rating ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [pending, startTransition] = useTransition();

  function choose(next: MessageRating) {
    // Tapping the same thumb again clears it: the tester changed their mind
    // about flagging at all, which is different from changing which way it points.
    const cleared = rating === next;
    // Kept so a refused write can be undone. Both actions can come back
    // `not-authenticated`, `not-flaggable` or `bad-rating` — an expired session
    // being the realistic one — and without this the thumb stayed lit over
    // nothing stored, then went blank on the next load. A mark that disappears
    // is worse than one that never appeared: the tester has no way to know
    // which of their flags survived. Found by CodeRabbit on PR #57.
    const previous = rating;
    setRating(cleared ? null : next);
    startTransition(async () => {
      const result = cleared
        ? await clearMessageRatingAction({ messageId })
        : await rateMessageAction({ messageId, rating: next, comment });
      if (!result.ok) setRating(previous);
    });
  }

  function saveComment() {
    if (!rating) return;
    const previous = comment;
    startTransition(async () => {
      const result = await rateMessageAction({ messageId, rating, comment });
      // Same rule as the thumb: an unsaved comment must not read as saved.
      if (!result.ok) setComment(previous);
    });
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <ThumbButton
          label={labels.up}
          active={rating === 'up'}
          disabled={pending}
          onClick={() => choose('up')}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </ThumbButton>
        <ThumbButton
          label={labels.down}
          active={rating === 'down'}
          disabled={pending}
          onClick={() => choose('down')}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </ThumbButton>
      </div>

      {rating && (
        <div className="flex items-center gap-1.5">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={saveComment}
            maxLength={280}
            placeholder={labels.commentPlaceholder}
            aria-label={labels.commentPlaceholder}
            className="w-full max-w-[42ch] border border-border bg-panel px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            onClick={saveComment}
            disabled={pending}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {labels.save}
          </button>
        </div>
      )}
    </div>
  );
}

function ThumbButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[
        'border px-1.5 py-1 transition-colors disabled:opacity-40',
        active
          ? 'border-signal text-signal'
          : 'border-transparent text-muted-foreground/50 hover:border-border hover:text-muted-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
