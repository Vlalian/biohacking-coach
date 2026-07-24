'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  finalizeWeeklyPlanAction,
  sendWeeklyMessageAction,
  startWeeklySessionAction,
} from './weekly-actions';

/** The lean message shape the transcript renders — no server-only fields. */
export interface UiMessage {
  id: string;
  role: 'athlete' | 'coach_ai' | 'head_coach';
  content: string;
  seq: number;
}

export interface WeeklySessionInitial {
  conversationId: string;
  weeklySessionNumber: number;
  messages: UiMessage[];
  ended: boolean;
}

type Notice = { kind: 'none' } | { kind: 'error' } | { kind: 'planned'; count: number };

/**
 * The Weekly Session — the Coach's once-a-week structured conversation
 * (Check-in → Review → Planning). The whole transcript is persisted server-side,
 * so `initial` restores an in-progress session on refresh; nothing lives only in
 * the browser (ADR 0006). When the athlete is happy with the week, "Save this
 * plan" extracts it into the calendar.
 */
export function WeeklySession({ initial }: { initial: WeeklySessionInitial | null }) {
  const t = useTranslations('WeeklySession');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [ended, setEnded] = useState<boolean>(initial?.ended ?? false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });

  function start() {
    setNotice({ kind: 'none' });
    startTransition(async () => {
      const result = await startWeeklySessionAction();
      if (result.ok) {
        setConversationId(result.conversationId);
        setMessages(result.messages);
        setEnded(false);
      } else {
        setNotice({ kind: 'error' });
      }
    });
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId) return;
    setNotice({ kind: 'none' });
    startTransition(async () => {
      const result = await sendWeeklyMessageAction(conversationId, content);
      if (result.ok) {
        setMessages(result.messages);
        setDraft('');
      } else {
        setNotice({ kind: 'error' });
      }
    });
  }

  function finalize() {
    if (!conversationId) return;
    setNotice({ kind: 'none' });
    startTransition(async () => {
      const result = await finalizeWeeklyPlanAction(conversationId);
      if (result.ok) {
        setEnded(true);
        setNotice({ kind: 'planned', count: result.sessionCount });
        router.refresh();
      } else {
        setNotice({ kind: 'error' });
      }
    });
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        {conversationId && !ended && (
          <button
            type="button"
            onClick={finalize}
            disabled={pending || messages.length === 0}
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {t('savePlan')}
          </button>
        )}
      </header>

      {!conversationId ? (
        <div className="flex flex-col items-center gap-3 rounded border border-neutral-200 p-6 dark:border-neutral-800">
          <p className="text-sm text-neutral-500">{t('intro')}</p>
          <button
            type="button"
            onClick={start}
            disabled={pending}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
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
                  m.role === 'athlete'
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

          {ended ? (
            <p className="text-sm text-neutral-500">{t('ended')}</p>
          ) : (
            <form onSubmit={send} className="flex gap-2">
              <label htmlFor="weekly-message" className="sr-only">
                {t('inputLabel')}
              </label>
              <input
                id="weekly-message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={pending}
                placeholder={t('placeholder')}
                className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <button
                type="submit"
                disabled={pending || draft.trim().length === 0}
                className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {t('send')}
              </button>
            </form>
          )}
        </>
      )}

      {notice.kind === 'planned' && (
        <p className="text-sm text-green-700 dark:text-green-500">
          {t('planned', { count: notice.count })}
        </p>
      )}
      {notice.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {t('error')}
        </p>
      )}
    </section>
  );
}
