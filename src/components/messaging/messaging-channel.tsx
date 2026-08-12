'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * The Coaching Channel — the persistent conversation shared by the athlete,
 * their Head Coach, and the AI Coach (CONTEXT.md: Coaching Channel,
 * Messaging View, Messaging Drawer). Presentational only, mirroring
 * `weekly-session.tsx`'s message-row convention so the shared channel reads
 * as a sibling of the private Coach Overlay, not a different product.
 *
 * Exists only in Coached Mode (CONTEXT.md) — there is no Coaching Link data
 * model yet, so this component is built as a shell against the brief's data
 * contract (`lovable/briefs/messaging.md`) and is not mounted anywhere the
 * running app reaches: `isCoachedMode` never turns true in solo MVP. Wiring
 * it to a real Coaching Link is a later slice, not this one.
 *
 * Two presentations of the same channel share this component: `'view'` is
 * the full-surface Messaging View, `'drawer'` is the docked panel that
 * stacks beside a Reference's surface (the shell brief's chrome already
 * hosts the docked frame — see `AppShell`'s `messagingContent` seam).
 */

export type ChannelAuthor = 'athlete' | 'head-coach' | 'ai-coach';

export interface ChannelReference {
  label: string;
}

export interface ChannelMessage {
  id: string;
  author: ChannelAuthor;
  authorName: string;
  content: string;
  timestamp: string;
  reference?: ChannelReference;
}

export interface MessagingChannelStrings {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  composerPlaceholder: string;
  send: string;
  aiThinking: string;
  youLabel: string;
  aiCoachLabel: string;
  closeDrawer: string;
}

export interface MessagingChannelProps {
  messages: ChannelMessage[];
  headCoachName: string;
  presentation: 'view' | 'drawer';
  drawerTitle?: string;
  aiStatus?: 'idle' | 'thinking';
  onSendMessage: (text: string) => void;
  onCloseDrawer?: () => void;
  t: MessagingChannelStrings;
}

export function MessagingChannel({
  messages,
  headCoachName,
  presentation,
  drawerTitle,
  aiStatus = 'idle',
  onSendMessage,
  onCloseDrawer,
  t,
}: MessagingChannelProps) {
  const [draft, setDraft] = useState('');

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setDraft('');
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {presentation === 'drawer' && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
            {drawerTitle ?? t.title}
          </span>
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label={t.closeDrawer}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-2xl tracking-[0.03em] text-foreground">{t.emptyTitle}</p>
            <p className="max-w-xs text-sm text-muted-foreground">{t.emptyBody}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <ChannelMessageRow key={m.id} message={m} headCoachName={headCoachName} t={t} />
            ))}
            {aiStatus === 'thinking' && (
              <p className="animate-pulse font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
                {t.aiThinking}
              </p>
            )}
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t.composerPlaceholder}
          rows={1}
          className="min-h-9 flex-1 resize-none border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="border border-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-40"
        >
          {t.send}
        </button>
      </form>
    </div>
  );
}

function ChannelMessageRow({
  message,
  headCoachName,
  t,
}: {
  message: ChannelMessage;
  headCoachName: string;
  t: MessagingChannelStrings;
}) {
  if (message.author === 'athlete') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t.youLabel}
        </span>
        <p className="max-w-[85%] whitespace-pre-wrap border border-border bg-panel px-3 py-2 text-sm leading-relaxed text-foreground">
          {message.content}
        </p>
        {message.reference && <ReferenceChip label={message.reference.label} />}
      </div>
    );
  }

  const isHeadCoach = message.author === 'head-coach';
  return (
    <div
      className={[
        'flex flex-col gap-1.5 border-l-2 pl-3',
        isHeadCoach ? 'border-muted-foreground' : 'border-signal',
      ].join(' ')}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className={isHeadCoach ? 'text-foreground' : 'text-signal'}>
          {isHeadCoach ? headCoachName : t.aiCoachLabel}
        </span>
      </span>
      <p className="max-w-[62ch] whitespace-pre-wrap text-[15px] leading-[1.7] text-foreground">
        {message.content}
      </p>
      {message.reference && <ReferenceChip label={message.reference.label} />}
    </div>
  );
}

function ReferenceChip({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit items-center border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </span>
  );
}
