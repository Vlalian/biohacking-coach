'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { AlertTriangle, Check, ChevronLeft, CornerDownLeft, Loader2 } from 'lucide-react';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { useDialogFocus } from '@/lib/use-dialog-focus';
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
  | { kind: 'consentRequired' }
  | { kind: 'stale' }
  | { kind: 'planned'; count: number };

/**
 * Turns an action failure into a notice. A `consent-required` refusal is its own
 * notice with a route back to Privacy & consent — not the generic error — so the
 * one case where the Coach is paused for a lawful-basis reason tells the athlete
 * how to lift it (the server gate is the control; this is its front door).
 */
function failureNotice(reason: string): Notice {
  return reason === 'consent-required' ? { kind: 'consentRequired' } : { kind: 'error' };
}

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
 *
 * Visual language ported from the Lovable design (iron-insight-grid,
 * coach-view brief) onto this exact, already-built interaction — the brief's
 * own reconciliation note says to reuse this component's shapes and keys
 * verbatim rather than treat the Lovable CoachView as the target: Coach Chat
 * and Session Negotiation (its other two modes) aren't built yet.
 */
export function WeeklySession({
  initial,
  athleteFirstName,
  raceTarget,
  onExit,
}: {
  initial: WeeklySessionInitial | null;
  /** Header only — never sent anywhere (ADR 0006). */
  athleteFirstName?: string;
  raceTarget?: string | null;
  /**
   * Returns to Coach Chat, the thread's baseline mode. Present when this is
   * hosted inside {@link CoachThread} (ADR 0007's one conversation); absent
   * when the Weekly Session is rendered on its own, in which case no
   * back-control is drawn.
   */
  onExit?: () => void;
}) {
  const t = useTranslations('WeeklySession');
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [ended, setEnded] = useState<boolean>(initial?.ended ?? false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });
  const [proposal, setProposal] = useState<UiPlanProposal | null>(initial?.proposal ?? null);
  const [popupOpen, setPopupOpen] = useState<boolean>(Boolean(initial?.proposal));
  // Dismissing the popup drops to the persistent bar, never to a dead end — so
  // Escape closes the popup rather than the conversation. Bound only while the
  // popup is up, since this component is mounted throughout the session.
  const proposalRef = useDialogFocus(
    useCallback(() => setPopupOpen(false), []),
    Boolean(proposal) && popupOpen,
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, pending]);

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
        setNotice(failureNotice(result.reason));
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
        setNotice(failureNotice(result.reason));
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
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-2xl leading-none tracking-[0.04em] text-foreground">
            {t('title')}
          </span>
          {athleteFirstName && (
            <div className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <div>{athleteFirstName}</div>
              {raceTarget && <div className="text-signal">{raceTarget}</div>}
            </div>
          )}
        </div>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-signal"
          >
            <ChevronLeft className="h-3 w-3" />
            {t('backToChat')}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {!conversationId ? (
          <div className="flex flex-col items-center gap-3 border border-dashed border-border bg-panel px-5 py-8 text-center">
            <p className="font-body text-sm text-muted-foreground">{t('intro')}</p>
            <button
              type="button"
              onClick={start}
              disabled={pending}
              className="mt-1 inline-flex items-center gap-2 bg-signal px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pending ? t('starting') : t('start')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} t={t} />
            ))}

            {pending && (
              <div className="flex flex-col gap-2 border-l-2 border-signal/40 pl-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t('thinking')}
                </div>
                <div className="flex items-center gap-1.5" aria-live="polite">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal"
                      style={{ animationDelay: `${i * 160}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Persistent bar: a pending plan can always be reviewed, saved, or
          cancelled here even if the popup was dismissed. */}
      {proposal && !popupOpen && (
        <div className="shrink-0 border-t border-signal/40 bg-signal/5 px-4 py-3">
          <p className="font-body text-sm text-foreground">
            {t('proposalPending', { count: proposal.sessions.length })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <GhostButton onClick={() => setPopupOpen(true)} disabled={pending}>
              {t('reviewPlan')}
            </GhostButton>
            <GhostButton onClick={cancelPlan} disabled={pending}>
              {t('cancelPlan')}
            </GhostButton>
            <PrimaryButton onClick={confirmPlan} disabled={pending}>
              {t('savePlan')}
            </PrimaryButton>
          </div>
        </div>
      )}

      {notice.kind !== 'none' && (
        <div className="shrink-0 px-4 pt-2">
          {notice.kind === 'planned' && (
            <Banner tone="signal" icon={Check}>
              {t('planned', { count: notice.count })}
            </Banner>
          )}
          {notice.kind === 'consentRequired' && (
            <Banner tone="warn" icon={AlertTriangle}>
              {t('consentRequired')}{' '}
              <Link href="/privacy" className="underline">
                {t('consentRequiredLink')}
              </Link>
            </Banner>
          )}
          {notice.kind === 'stale' && (
            <Banner tone="warn" icon={AlertTriangle}>
              {t('proposalStale')}
            </Banner>
          )}
          {notice.kind === 'error' && (
            <Banner tone="destructive" icon={AlertTriangle}>
              {t('error')}
            </Banner>
          )}
        </div>
      )}

      {conversationId && (
        <footer className="shrink-0 border-t border-border px-4 py-3">
          {ended ? (
            <p className="font-body text-sm text-muted-foreground">{t('ended')}</p>
          ) : (
            <form onSubmit={send} className="flex items-end gap-2">
              <label htmlFor="weekly-message" className="sr-only">
                {t('inputLabel')}
              </label>
              <textarea
                id="weekly-message"
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
                className="max-h-32 min-h-9 flex-1 resize-none border border-border bg-panel px-3 py-2 font-body text-sm text-foreground outline-none focus:border-signal"
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
          )}
        </footer>
      )}

      {/* The confirmation popup — the athlete decides whether this plan touches
          their calendar. Save and Cancel are both present; dismissing the popup
          drops to the persistent bar above, never to a dead end. */}
      {proposal && popupOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-proposal-title"
        >
          <div
            ref={proposalRef}
            tabIndex={-1}
            className="flex max-h-[80%] w-full max-w-sm flex-col border border-border bg-panel shadow-2xl outline-none"
          >
            <div className="border-b border-rule px-5 py-4">
              <h3
                id="plan-proposal-title"
                className="font-display text-xl tracking-[0.03em] text-foreground"
              >
                {t('proposalTitle')}
              </h3>
              <p className="mt-1 font-body text-sm text-muted-foreground">{t('proposalIntro')}</p>
            </div>

            <ul className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
              {proposal.sessions.map((s, i) => {
                const color = TYPE_COLORS[s.type] ?? DEFAULT_TYPE_COLOR;
                return (
                  <li key={`${s.date}-${i}`} className="flex gap-3 px-5 py-3">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-body text-sm text-foreground">{planLine(s)}</div>
                      {s.note && (
                        <div className="mt-0.5 font-body text-xs text-muted-foreground">
                          {s.note}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-4">
              <GhostButton onClick={cancelPlan} disabled={pending}>
                {t('cancelPlan')}
              </GhostButton>
              <GhostButton onClick={() => setPopupOpen(false)} disabled={pending}>
                {t('keepTalking')}
              </GhostButton>
              <PrimaryButton onClick={confirmPlan} disabled={pending}>
                {t('savePlan')}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MessageRow({
  message,
  t,
}: {
  message: UiMessage;
  t: ReturnType<typeof useTranslations<'WeeklySession'>>;
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
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className={isHeadCoach ? 'text-foreground' : 'text-signal'}>
          {isHeadCoach ? t('headCoachLabel') : t('coachLabel')}
        </span>
      </span>
      <p className="max-w-[62ch] whitespace-pre-wrap font-body text-[15px] leading-[1.7] text-foreground">
        {message.content}
      </p>
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'signal' | 'warn' | 'destructive';
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'signal'
      ? 'border-signal text-signal'
      : tone === 'warn'
        ? 'border-signal text-signal'
        : 'border-destructive text-destructive';
  return (
    <div role={tone === 'signal' ? undefined : 'alert'} className={`flex items-start gap-2 border-l-2 ${toneClass} bg-panel px-3 py-2`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-body text-sm text-foreground">{children}</p>
    </div>
  );
}
