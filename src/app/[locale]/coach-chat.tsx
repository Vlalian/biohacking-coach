'use client';

import { CoachMessageFooter } from './coach-message-footer';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, CornerDownLeft, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import { sendCoachChatMessageAction } from './chat-actions';
import { PlanProposalCard, type UiPlanProposal } from './plan-proposal-card';
import { usePlanDecision } from './use-plan-decision';
import type { UiMessage } from './ui-message';
import { Thinking } from '@/components/ui/thinking';

/**
 * Coach Chat — the Coach Overlay's baseline mode (ADR 0007). Open-ended and
 * athlete-led: the athlete speaks first, so there is no opener to render and no
 * "start" gesture. The thread simply exists.
 *
 * Visual language is deliberately identical to the Weekly Session's message
 * rows: the athlete is in *one* conversation with *one* Coach, so the two modes
 * must not look like two products (CONTEXT.md: "one conversation, not many").
 *
 * The Reference (a Session tapped via "Discuss with Coach") renders as a
 * dismissable chip above the composer and rides along with the next message.
 * It conditions that turn only — the athlete asked about a session, got an
 * answer, and may move on.
 *
 * The one conversation may also agree a week (`training-architecture/20`).
 * When the Coach proposes one — or a drafted week is brought in from the
 * calendar — the same Action Proposal card the Weekly Session shows appears
 * here, and only the athlete's tap writes the calendar.
 */

export interface CoachChatInitial {
  conversationId: string;
  messages: UiMessage[];
  /** A week awaiting the athlete's decision, restored with the transcript. */
  proposal?: UiPlanProposal | null;
}

type Notice =
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'consentRequired' }
  | { kind: 'unsafeContent' }
  | { kind: 'ranOutOfRoom' }
  | { kind: 'planned'; count: number }
  | { kind: 'stale' };

export function CoachChat({ initial }: { initial: CoachChatInitial | null }) {
  const t = useTranslations('CoachChat');
  const tWeekly = useTranslations('WeeklySession');
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const { reference, setReference } = useCoachOverlay();

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [draft, setDraft] = useState('');
  // The message on its way to the Coach, shown in the thread the moment it is
  // sent. Nothing is stored until the Coach has answered (conversation-turn),
  // so without this the athlete's own words appeared only with the reply —
  // "the Coach forgets" on Mads's smoke run of PR #71, 2026-09-17.
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });
  // The athlete's decision on a proposed week: state and server calls shared
  // with the Weekly Session (`use-plan-decision.ts`). The chat is never ended.
  const decision = usePlanDecision({ conversationId, initial: initial?.proposal });
  const visibleNotice: Notice = notice.kind !== 'none' ? notice : decision.notice;
  // One thing at a time: a send while a decision is in flight could stage a
  // proposal the decision then applies to (CodeRabbit, PR #71), and a decision
  // during a send would decide a card the reply is about to replace.
  const busy = pending || decision.pending;
  // The host's notice would otherwise sit over the decision's outcome.
  const confirm = () => { setNotice({ kind: 'none' }); decision.confirm(); };
  const cancel = () => { setNotice({ kind: 'none' }); decision.cancel(); };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, pending]);

  function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;

    // The Reference is consumed by this turn: clear it now so a follow-up
    // question isn't silently still "about" a session the athlete moved on from.
    const referenceSessionId = reference?.sessionId ?? null;
    setDraft('');
    setInFlight(content);
    setNotice({ kind: 'none' });

    startTransition(async () => {
      const result = await sendCoachChatMessageAction({
        conversationId,
        content,
        referenceSessionId,
      });

      if (!result.ok) {
        setNotice(
          result.reason === 'consent-required'
            ? { kind: 'consentRequired' }
            : result.reason === 'unsafe-content'
              ? { kind: 'unsafeContent' }
              : result.reason === 'ran-out-of-room'
                ? { kind: 'ranOutOfRoom' }
                : { kind: 'error' },
        );
        // Hand the message back so a failure never eats what they typed.
        setInFlight(null);
        setDraft(content);
        return;
      }

      setInFlight(null);
      setConversationId(result.conversationId);
      setMessages(result.messages);
      setReference(null);
      decision.receive(result.proposal);
    });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 && !inFlight ? (
          <div className="flex flex-col items-center gap-2 border border-dashed border-border bg-panel px-5 py-8 text-center">
            <p className="font-display text-xl leading-none tracking-[0.03em] text-foreground">
              {t('emptyTitle')}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('emptyBody')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <ChatRow key={m.id} message={m} t={t} />
            ))}

            {inFlight && (
              <div className="flex flex-col items-end gap-1" data-sending>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t('youLabel')}
                </span>
                <p className="max-w-[85%] whitespace-pre-wrap border border-dashed border-border bg-panel px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                  {inFlight}
                </p>
              </div>
            )}

            {inFlight && <Thinking label={t('thinking')} />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {decision.proposal && (
        <PlanProposalCard
          proposal={decision.proposal}
          pending={busy}
          popupOpen={decision.popupOpen}
          onReview={decision.review}
          onKeepTalking={decision.keepTalking}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}

      {visibleNotice.kind === 'planned' && (
        <div className="shrink-0 px-4 pt-2">
          <div className="flex items-start gap-2 border-l-2 border-signal bg-panel px-3 py-2 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
            <span>{tWeekly('planned', { count: visibleNotice.count })}</span>
          </div>
        </div>
      )}

      {visibleNotice.kind !== 'none' && visibleNotice.kind !== 'planned' && (
        // role="alert" so the failure is announced: the notice appears far from
        // the composer the athlete is looking at, and a screen-reader user
        // otherwise gets no signal that their message did not send.
        <div className="shrink-0 px-4 pt-2" role="alert">
          <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              {visibleNotice.kind === 'consentRequired' ? (
                <>
                  {t('consentRequired')}{' '}
                  <Link href="/privacy" className="underline">
                    {t('consentRequiredLink')}
                  </Link>
                </>
              ) : visibleNotice.kind === 'unsafeContent' ? (
                t('unsafeContent')
              ) : visibleNotice.kind === 'ranOutOfRoom' ? (
                t('ranOutOfRoom')
              ) : visibleNotice.kind === 'stale' ? (
                tWeekly('proposalStale')
              ) : (
                t('error')
              )}
            </span>
          </div>
        </div>
      )}

      <footer className="shrink-0 border-t border-border px-4 py-3">
        {reference && (
          <div className="mb-2 inline-flex items-center gap-2 border border-signal/40 bg-signal/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
            {reference.label}
            <button
              type="button"
              onClick={() => setReference(null)}
              aria-label={t('clearReference')}
              className="transition-opacity hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <form onSubmit={send} className="flex items-end gap-2">
          <label htmlFor="coach-chat-message" className="sr-only">
            {t('inputLabel')}
          </label>
          <textarea
            id="coach-chat-message"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(e);
              }
            }}
            disabled={busy}
            placeholder={t('placeholder')}
            className="max-h-32 min-h-9 flex-1 resize-none border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            className="flex shrink-0 items-center gap-1.5 bg-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-signal-foreground transition-opacity disabled:opacity-35"
          >
            {t('send')}
            <CornerDownLeft className="h-3 w-3" />
          </button>
        </form>
      </footer>
    </div>
  );
}

/** Mirrors the Weekly Session's MessageRow exactly — one Coach, one voice. */
function ChatRow({
  message,
  t,
}: {
  message: UiMessage;
  t: ReturnType<typeof useTranslations<'CoachChat'>>;
}) {
  if (message.role === 'athlete') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('youLabel')}
        </span>
        <p className="max-w-[85%] whitespace-pre-wrap border border-border bg-panel px-3 py-2 text-sm leading-relaxed text-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  const isHeadCoach = message.role === 'head_coach';
  return (
    <div
      className={[
        'flex flex-col gap-1.5 border-l-2 pl-3',
        isHeadCoach ? 'border-muted-foreground' : 'border-signal',
      ].join(' ')}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className={isHeadCoach ? 'text-foreground' : 'text-signal'}>
          {isHeadCoach ? t('headCoachLabel') : t('coachLabel')}
        </span>
      </span>
      <p className="max-w-[62ch] whitespace-pre-wrap text-[15px] leading-[1.7] text-foreground">
        {message.content}
      </p>
      <CoachMessageFooter message={message} t={t} />
    </div>
  );
}
