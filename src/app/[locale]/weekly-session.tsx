'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  commitWeeklyPlanAction,
  declineWeeklyPlanAction,
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

/** One proposed session, as the confirmation popup shows it. */
export interface UiPlanSession {
  date: string;
  type: string;
  durationMinutes: number | null;
  zone: string | null;
  note: string | null;
}

export interface UiPlanProposal {
  sessions: UiPlanSession[];
}

export interface WeeklySessionInitial {
  conversationId: string;
  weeklySessionNumber: number;
  messages: UiMessage[];
  proposal: UiPlanProposal | null;
  ended: boolean;
}

type Notice =
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'stale' }
  | { kind: 'planned'; count: number };

/**
 * The Weekly Session — the Coach's once-a-week structured conversation
 * (Check-in → Review → Planning). The whole transcript is persisted server-side,
 * so `initial` restores an in-progress session on refresh; nothing lives only in
 * the browser (ADR 0006).
 *
 * The Coach never writes the calendar. When it and the athlete agree on a week,
 * it *proposes* one; the athlete confirms or cancels it in a popup. So the
 * athlete always decides what changes their plan. The confirm/cancel controls
 * stay reachable at all times a proposal is pending — in the popup, and in a
 * persistent bar when the popup is dismissed — so an error can never strand the
 * athlete with a plan they can neither save nor discard.
 */
export function WeeklySession({ initial }: { initial: WeeklySessionInitial | null }) {
  const t = useTranslations('WeeklySession');
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [ended, setEnded] = useState<boolean>(initial?.ended ?? false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });
  const [proposal, setProposal] = useState<UiPlanProposal | null>(initial?.proposal ?? null);
  const [popupOpen, setPopupOpen] = useState<boolean>(Boolean(initial?.proposal));

  function start() {
    setNotice({ kind: 'none' });
    startTransition(async () => {
      const result = await startWeeklySessionAction();
      if (result.ok) {
        setConversationId(result.conversationId);
        setMessages(result.messages);
        setEnded(false);
        setProposal(null);
        setPopupOpen(false);
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
        // A fresh proposal supersedes any earlier one and reopens the popup.
        if (result.proposal) {
          setProposal(result.proposal);
          setPopupOpen(true);
        }
      } else {
        setNotice({ kind: 'error' });
      }
    });
  }

  function confirmPlan() {
    if (!conversationId) return;
    setNotice({ kind: 'none' });
    startTransition(async () => {
      const result = await commitWeeklyPlanAction(conversationId);
      if (result.ok) {
        setProposal(null);
        setPopupOpen(false);
        setEnded(true);
        setNotice({ kind: 'planned', count: result.sessionCount });
        router.refresh();
      } else if (!result.ok && result.reason === 'stale') {
        // The plan crossed into a new day. Keep it visible so the athlete can
        // cancel and ask for a fresh one, rather than committing a shrunken week.
        setPopupOpen(false);
        setNotice({ kind: 'stale' });
      } else {
        setNotice({ kind: 'error' });
      }
    });
  }

  function cancelPlan() {
    if (!conversationId) return;
    setNotice({ kind: 'none' });
    startTransition(async () => {
      const result = await declineWeeklyPlanAction(conversationId);
      if (result.ok) {
        setProposal(null);
        setPopupOpen(false);
      } else {
        setNotice({ kind: 'error' });
      }
    });
  }

  const primaryBtn =
    'rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';
  const secondaryBtn =
    'rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900';

  function planLine(s: UiPlanSession): string {
    const day = format.dateTime(new Date(`${s.date}T00:00:00`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const bits = [
      day,
      s.type,
      s.durationMinutes != null ? t('minutes', { count: s.durationMinutes }) : null,
      s.zone,
    ].filter(Boolean);
    return bits.join(' · ');
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
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

          {/* Persistent bar: a pending plan can always be reviewed, saved, or
              cancelled here even if the popup was dismissed. */}
          {proposal && !popupOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
              <span>{t('proposalPending', { count: proposal.sessions.length })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPopupOpen(true)}
                  disabled={pending}
                  className={secondaryBtn}
                >
                  {t('reviewPlan')}
                </button>
                <button type="button" onClick={cancelPlan} disabled={pending} className={secondaryBtn}>
                  {t('cancelPlan')}
                </button>
                <button type="button" onClick={confirmPlan} disabled={pending} className={primaryBtn}>
                  {t('savePlan')}
                </button>
              </div>
            </div>
          )}

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
                className={primaryBtn}
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
      {notice.kind === 'stale' && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-500">
          {t('proposalStale')}
        </p>
      )}
      {notice.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {t('error')}
        </p>
      )}

      {/* The confirmation popup — the athlete decides whether this plan touches
          their calendar. Save and Cancel are both present; dismissing the popup
          drops to the persistent bar above, never to a dead end. */}
      {proposal && popupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-proposal-title"
        >
          <div className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
            <div className="flex flex-col gap-1">
              <h3 id="plan-proposal-title" className="text-base font-semibold">
                {t('proposalTitle')}
              </h3>
              <p className="text-sm text-neutral-500">{t('proposalIntro')}</p>
            </div>

            <ul className="flex flex-col gap-2">
              {proposal.sessions.map((s, i) => (
                <li
                  key={`${s.date}-${i}`}
                  className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700"
                >
                  <div className="font-medium">{planLine(s)}</div>
                  {s.note && <div className="text-neutral-500">{s.note}</div>}
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancelPlan} disabled={pending} className={secondaryBtn}>
                {t('cancelPlan')}
              </button>
              <button
                type="button"
                onClick={() => setPopupOpen(false)}
                disabled={pending}
                className={secondaryBtn}
              >
                {t('keepTalking')}
              </button>
              <button type="button" onClick={confirmPlan} disabled={pending} className={primaryBtn}>
                {t('savePlan')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
