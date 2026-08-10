'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
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
  const [error, setError] = useState(false);

  function start() {
    setError(false);
    startTransition(async () => {
      const result = await startBriefingAction(athleteId);
      if (result.ok) {
        setConversationId(result.conversationId);
        setMessages(result.messages);
      } else {
        setError(true);
      }
    });
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId) return;
    setError(false);
    startTransition(async () => {
      const result = await sendBriefingMessageAction(conversationId, content);
      if (result.ok) {
        setMessages(result.messages);
        setDraft('');
      } else {
        setError(true);
      }
    });
  }

  const primaryBtn =
    'rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </header>

      {!conversationId ? (
        <div className="flex flex-col items-center gap-3 rounded border border-neutral-200 p-6 dark:border-neutral-800">
          <p className="text-sm text-neutral-500">{t('intro')}</p>
          <button type="button" onClick={start} disabled={pending} className={primaryBtn}>
            {pending ? t('starting') : t('start')}
          </button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === 'head_coach'
                    ? 'self-end rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900'
                    : 'self-start rounded-lg bg-neutral-100 px-3 py-2 text-sm whitespace-pre-wrap dark:bg-neutral-800'
                }
              >
                {m.content}
              </li>
            ))}
            {pending && (
              <li className="self-start text-sm text-neutral-400" aria-live="polite">
                {t('thinking')}
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
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
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

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t('error')}
        </p>
      )}
    </section>
  );
}
