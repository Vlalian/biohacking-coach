'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CornerDownLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { FallbackFailureReason } from '@/features/feedback/feedback';
import { sendFeedbackTurnAction, submitFallbackFeedbackAction } from './feedback-actions';
import type { UiMessage } from './weekly-session';

/**
 * The Feedback Interview surface (`showable-version/07`).
 *
 * Two ways to say something, in one page, and the second one is not a fallback
 * in the apologetic sense — it is the guarantee. The conversation needs a model
 * call; the textarea below it needs nothing but a form post, so a tester whose
 * Coach is broken can still tell someone, and their submission is *tagged* with
 * why they ended up there rather than being logged as an ordinary note.
 *
 * The interviewer's rows are visually distinct from the Coach's on purpose: this
 * is explicitly not the Coach, and the one thing the tester must not have to
 * work out is who they are talking to.
 */

export interface FeedbackInterviewInitial {
  conversationId: string;
  messages: UiMessage[];
}

type Notice = { kind: 'none' } | { kind: 'error' } | { kind: 'consentRequired' };

/**
 * What the notice says happened, in the terms the fallback row records — from
 * {@link FALLBACK_FAILURE_REASONS}, so the client cannot tag a submission with a
 * reason the server would then throw away.
 */
const NOTICE_REASON: Record<Notice['kind'], FallbackFailureReason | null> = {
  none: null,
  error: 'coach-unavailable',
  consentRequired: 'consent-required',
};

export function FeedbackInterview({
  initial,
  openedFrom,
}: {
  initial: FeedbackInterviewInitial | null;
  /** The View the escape hatch was opened from, resolved by the page. */
  openedFrom: string | null;
}) {
  const t = useTranslations('FeedbackInterview');
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, pending]);

  function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;

    setDraft('');
    setNotice({ kind: 'none' });

    startTransition(async () => {
      const result = await sendFeedbackTurnAction({ conversationId, content });

      if (!result.ok) {
        setNotice(
          result.reason === 'consent-required' ? { kind: 'consentRequired' } : { kind: 'error' },
        );
        // Hand it back — a failure must never eat what they typed, least of all
        // on the surface they came to because something already failed.
        setDraft(content);
        return;
      }

      setConversationId(result.conversationId);
      setMessages(result.messages);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl leading-none tracking-[0.03em] text-foreground">
          {t('title')}
        </h1>
        <p className="max-w-[62ch] font-body text-sm leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
      </header>

      <section className="flex flex-col border border-border bg-panel">
        <div className="flex flex-col gap-5 px-4 py-5">
          {messages.length === 0 && !pending ? (
            <div className="flex flex-col items-center gap-2 border border-dashed border-border px-5 py-8 text-center">
              <p className="font-display text-xl leading-none tracking-[0.03em] text-foreground">
                {t('emptyTitle')}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{t('emptyBody')}</p>
            </div>
          ) : (
            messages.map((m) => <InterviewRow key={m.id} message={m} t={t} />)
          )}

          {pending && (
            <div className="flex flex-col gap-2 border-l-2 border-muted-foreground/40 pl-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t('thinking')}
              </div>
              <div className="flex items-center gap-1.5" aria-live="polite">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {notice.kind !== 'none' && (
          <div className="px-4 pb-2" role="alert">
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>
                {notice.kind === 'consentRequired' ? (
                  <>
                    {t('consentRequired')}{' '}
                    <Link href="/privacy" className="underline">
                      {t('consentRequiredLink')}
                    </Link>
                  </>
                ) : (
                  t('error')
                )}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={send} className="flex items-end gap-2 border-t border-border px-4 py-3">
          <label htmlFor="feedback-interview-message" className="sr-only">
            {t('inputLabel')}
          </label>
          <textarea
            id="feedback-interview-message"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(e);
              }
            }}
            disabled={pending}
            placeholder={t('placeholder')}
            className="max-h-32 min-h-9 flex-1 resize-none border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="flex shrink-0 items-center gap-1.5 bg-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-signal-foreground transition-opacity disabled:opacity-35"
          >
            {t('send')}
            <CornerDownLeft className="h-3 w-3" />
          </button>
        </form>
      </section>

      <FallbackBox
        view={openedFrom}
        coachFailureReason={NOTICE_REASON[notice.kind]}
        t={t}
      />
    </div>
  );
}

/**
 * The plain box. No model call, no consent gate, no conversation — it posts and
 * it stores, and it is deliberately always on the page rather than appearing
 * when something breaks. A tester who simply prefers to type is not a degraded
 * case, and a box that only appears after a failure is a box nobody finds.
 */
function FallbackBox({
  view,
  coachFailureReason,
  t,
}: {
  view: string | null;
  coachFailureReason: FallbackFailureReason | null;
  t: ReturnType<typeof useTranslations<'FeedbackInterview'>>;
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || pending) return;

    startTransition(async () => {
      const result = await submitFallbackFeedbackAction({ body, view, coachFailureReason });
      setState(result.ok ? 'sent' : 'error');
      if (result.ok) setBody('');
    });
  }

  return (
    <section className="flex flex-col gap-2 border border-border bg-panel p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        {t('fallbackTitle')}
      </h2>
      <p className="font-body text-sm text-muted-foreground">{t('fallbackBody')}</p>

      <form onSubmit={submit} className="mt-1 flex flex-col gap-2">
        <label htmlFor="feedback-fallback" className="sr-only">
          {t('fallbackLabel')}
        </label>
        <textarea
          id="feedback-fallback"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('fallbackPlaceholder')}
          className="resize-y border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || body.trim().length === 0}
            className="self-start border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-opacity disabled:opacity-35"
          >
            {t('fallbackSend')}
          </button>
          {state !== 'idle' && (
            <span
              role="status"
              className={[
                'font-body text-sm',
                state === 'sent' ? 'text-muted-foreground' : 'text-destructive',
              ].join(' ')}
            >
              {state === 'sent' ? t('fallbackSent') : t('fallbackError')}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

/** Not the Coach's message row — a different voice needs a different mark. */
function InterviewRow({
  message,
  t,
}: {
  message: UiMessage;
  t: ReturnType<typeof useTranslations<'FeedbackInterview'>>;
}) {
  if (message.role === 'athlete') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('youLabel')}
        </span>
        <p className="max-w-[85%] whitespace-pre-wrap border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-muted-foreground pl-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('interviewerLabel')}
      </span>
      <p className="max-w-[62ch] whitespace-pre-wrap text-[15px] leading-[1.7] text-foreground">
        {message.content}
      </p>
    </div>
  );
}
