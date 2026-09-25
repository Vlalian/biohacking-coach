'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Thinking } from '@/components/ui/thinking';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';
import {
  sendBriefingMessageAction,
  startBriefingAction,
} from './briefing-actions';

/** The lean message shape the transcript renders — no server-only fields. */
export interface UiBriefingMessage {
  id: string;
  role: 'athlete' | 'coach_ai' | 'head_coach';
  content: string;
  seq: number;
}

const primaryBtn =
  'inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50';

export interface BriefingInitial {
  conversationId: string;
  messages: UiBriefingMessage[];
}

/**
 * The Coach Briefing — the Head Coach's own conversation with the Coach about
 * one linked athlete (CONTEXT.md; the upward half of Hyper Intelligence). The AI
 * opens with its read and answers the coach's questions, drawing only on what
 * the Coaching Link permits (Link Visibility, enforced server-side).
 *
 * The whole transcript is persisted server-side, so `initial` restores an
 * existing briefing on refresh; nothing lives only in the browser (ADR 0006).
 * The Head Coach's turns render on the right, the Coach's on the left.
 */
export function Briefing({
  athleteId,
  initial,
}: {
  athleteId: string;
  initial: BriefingInitial | null;
}) {
  const t = useTranslations('Briefing');
  const [pending, startTransition] = useTransition();

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiBriefingMessage[]>(
    initial?.messages ?? [],
  );
  const [draft, setDraft] = useState('');
  // Three states, not a boolean: content the guard refuses will be refused
  // identically on a retry, so telling the coach to "try again" would be wrong.
  const [error, setError] = useState<'none' | 'generic' | 'unsafeContent'>('none');
  const failed = (reason?: string) =>
    setError(reason === 'unsafe-content' ? 'unsafeContent' : 'generic');

  function start() {
    setError('none');
    startTransition(async () => {
      // A server action can reject outright (the Anthropic call fails, a query
      // throws), not only resolve to { ok: false }. Without the catch the
      // rejection settles the transition with the UI unchanged and no error —
      // a silent no-op — so both outcomes must land on setError.
      try {
        const result = await startBriefingAction(athleteId);
        if (result.ok) {
          setConversationId(result.conversationId);
          setMessages(result.messages);
        } else {
          failed(result.reason);
        }
      } catch {
        failed();
      }
    });
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId) return;
    setError('none');
    startTransition(async () => {
      try {
        const result = await sendBriefingMessageAction(conversationId, content);
        if (result.ok) {
          setMessages(result.messages);
          setDraft('');
        } else {
          failed(result.reason);
        }
      } catch {
        failed();
      }
    });
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold uppercase italic tracking-[0.03em] text-foreground">{t('title')}</h2>
        <p className="font-body text-base text-muted-foreground">{t('subtitle')}</p>
      </header>

      {!conversationId ? (
        <BriefingOpener pending={pending} onStart={start} />
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === 'head_coach'
                    ? 'max-w-[85%] self-end bg-sidebar px-4 py-3 font-body text-base text-sidebar-foreground'
                    : 'max-w-[62ch] self-start whitespace-pre-wrap border-l-2 border-signal bg-panel px-4 py-3 font-body text-base leading-[1.7] text-foreground'
                }
              >
                {m.content}
              </li>
            ))}
            {pending && (
              <li className="self-start">
                <Thinking label={t('thinking')} tone="muted" />
              </li>
            )}
          </ol>

          <form onSubmit={send} className="flex gap-2">
            <label htmlFor="briefing-message" className="sr-only">
              {t('inputLabel')}
            </label>
            <input
              id="briefing-message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={pending}
              placeholder={t('placeholder')}
              className="h-11 flex-1 border border-border bg-background px-3 font-body text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-signal"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              className={primaryBtn}
            >
              {t('send')}
            </button>
          </form>
        </>
      )}

      {error !== 'none' && (
        <p role="alert" className="font-body text-sm text-destructive">
          {error === 'unsafeContent' ? t('unsafeContent') : t('error')}
        </p>
      )}
    </section>
  );
}

/**
 * The open state, before a briefing exists. While the ~30 s Coach call runs
 * behind `startBriefingAction`, the button and a live status both say the week
 * is being read and roughly how long (`training-architecture/29`, decision 9)
 * — the click used to change one word on the button and nothing else, and a
 * coach who switched tabs read that as nothing happening. Its own component so
 * the pending branch renders without a click.
 */
export function BriefingOpener({ pending, onStart }: { pending: boolean; onStart: () => void }) {
  const t = useTranslations('Briefing');
  // Said once: the button goes quiet ("Opening…") and the status line under it
  // carries the sentence with the estimate (Mads, PR #78 smoke run, S23).
  return (
    <div className="flex flex-col items-center gap-4 border border-dashed border-border bg-panel p-8">
      <p className="max-w-md text-center font-body text-base text-muted-foreground">{t('intro')}</p>
      <button type="button" onClick={onStart} disabled={pending} className={primaryBtn}>
        {pending ? t('opening') : t('start')}
      </button>
      {pending && <Thinking label={t('starting', { seconds: COACH_EXPECTED_SECONDS })} tone="muted" />}
    </div>
  );
}
