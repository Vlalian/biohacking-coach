'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, CornerDownLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { FallbackFailureReason } from '@/features/feedback/feedback';
import { sendFeedbackTurnAction, submitFallbackFeedbackAction } from './feedback-actions';
import type { UiMessage } from './ui-message';
import { Thinking } from '@/components/ui/thinking';

/**
 * The Feedback Interview surface (`showable-version/07`).
 *
 * One way to say something: the interview (`showable-version/58`, Mads
 * 2026-09-26). The plain box is its fallback and nothing more. It appears only
 * once the interviewer has failed to answer, or cannot run without the AI
 * consent the tester has not given, and it needs nothing but a form post, so a
 * tester whose AI is broken can still tell someone. Their submission is
 * *tagged* with why they ended up there rather than logged as an ordinary note.
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
type NoticeKind = Notice['kind'];

/**
 * What the notice says happened, in the terms the fallback row records — from
 * {@link FALLBACK_FAILURE_REASONS}, so the client cannot tag a submission with a
 * reason the server would then throw away.
 */
const NOTICE_REASON: Record<NoticeKind, FallbackFailureReason | null> = {
  none: null,
  error: 'coach-unavailable',
  consentRequired: 'consent-required',
};

export function FeedbackInterview({
  initial,
  openedFrom,
  initialNotice = 'none',
}: {
  initial: FeedbackInterviewInitial | null;
  /** The View the escape hatch was opened from, resolved by the page. */
  openedFrom: string | null;
  /**
   * The notice to open on. The page never passes it; a static render has no
   * way to fail a turn, so this is how a test puts the page in its failed state.
   */
  initialNotice?: NoticeKind;
}) {
  const t = useTranslations('FeedbackInterview');
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<Notice>({ kind: initialNotice });
  // Why the box is on the page, or null while it is not. Set by a failure and
  // never cleared: a later turn that goes through must not take away a note the
  // tester had started writing in the box.
  const [fallbackReason, setFallbackReason] = useState<FallbackFailureReason | null>(
    NOTICE_REASON[initialNotice],
  );

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
        // A refused id never becomes valid again — the interview was ended, or
        // erased, or was never theirs. Holding on to it refuses every later turn
        // too, so a tester whose page has been open a while cannot say anything
        // at all until they think to reload. Dropping it starts a fresh
        // interview on their next send, which is the outcome they wanted.
        if (result.reason === 'not-owner') setConversationId(null);
        const failed: NoticeKind =
          result.reason === 'consent-required' ? 'consentRequired' : 'error';
        setNotice({ kind: failed });
        setFallbackReason(NOTICE_REASON[failed]);
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-bold uppercase italic leading-none tracking-[0.03em] text-foreground">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-[62ch] font-body text-base leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
      </header>

      <section className="flex flex-col border border-border bg-panel">
        <div className="flex max-h-[46vh] min-h-56 flex-col gap-5 overflow-y-auto px-4 py-5">
          {messages.length === 0 && !pending ? (
            <div className="flex flex-col items-center gap-2 border border-dashed border-border px-5 py-8 text-center">
              <p className="font-display text-2xl font-bold uppercase italic leading-none tracking-[0.03em] text-foreground">
                {t('emptyTitle')}
              </p>
              <p className="text-base leading-relaxed text-muted-foreground">{t('emptyBody')}</p>
            </div>
          ) : (
            messages.map((m) => <InterviewRow key={m.id} message={m} t={t} />)
          )}

          {pending && <Thinking label={t('thinking')} tone="muted" />}
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
            className="max-h-32 min-h-11 flex-1 resize-none border border-border bg-background px-3 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-signal"
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="inline-flex h-11 shrink-0 items-center gap-2 border border-foreground px-4 font-body text-base font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-35"
          >
            {t('send')}
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </form>
      </section>

      {fallbackReason !== null && (
        <FallbackBox view={openedFrom} coachFailureReason={fallbackReason} t={t} />
      )}
    </div>
  );
}

/**
 * The plain box. No model call, no consent gate, no conversation — it posts and
 * it stores. It used to sit on the page all the time, as a second way in; since
 * `showable-version/58` the interview is the one way, and this is only what is
 * left when the interviewer cannot answer. The notice above it says so.
 */
function FallbackBox({
  view,
  coachFailureReason,
  t,
}: {
  view: string | null;
  coachFailureReason: FallbackFailureReason;
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
    <section
      data-fallback={coachFailureReason}
      className="flex flex-col gap-2 border border-border bg-panel p-5"
    >
      <h2 className="font-display text-2xl font-bold uppercase italic tracking-[0.03em] text-foreground">
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
          className="mt-2 resize-y border border-border bg-background p-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || body.trim().length === 0}
            className="inline-flex h-11 items-center self-start bg-foreground px-5 font-body text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-35"
          >
            {t('fallbackSend')}
          </button>
          {state !== 'idle' && (
            <span
              role="status"
              className={[
                'font-body text-sm',
                'inline-flex items-center gap-1.5',
                state === 'sent' ? 'text-signal' : 'text-destructive',
              ].join(' ')}
            >
              {state === 'sent' && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
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
        <span className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
          {t('youLabel')}
        </span>
        <p className="max-w-[85%] whitespace-pre-wrap border border-border bg-background px-4 py-3 text-base leading-relaxed text-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-muted-foreground pl-3">
      <span className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
        {t('interviewerLabel')}
      </span>
      <p className="max-w-[62ch] whitespace-pre-wrap text-base leading-[1.7] text-foreground">
        {message.content}
      </p>
    </div>
  );
}
