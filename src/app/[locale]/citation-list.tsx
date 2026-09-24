'use client';

import { useState } from 'react';
import type { Citation } from '@/lib/citation';

/**
 * The sources behind a Coach message, as a plain reference list.
 *
 * Mads decided the presentation twice on 2026-08-18 and this is the second one:
 * a reference list as in a paper, not an underlined span inside the reply. That
 * is structurally safer and not merely cheaper — an underlined span is a claim
 * about a range of characters the *model* generated, so the model has to mark
 * them, and a model that writes its own citations can write one for a claim it
 * invented. Here the app renders exactly what retrieval supplied, so a citation
 * cannot be fabricated: the model is not the one producing it.
 *
 * **The heading is "What I drew on", not "Sources", and that is load-bearing.**
 * The list honestly says *these sources were in front of me* — not *this
 * sentence came from source 3*. "Sources" implies claim-level attribution the
 * list does not have, and a label that overstates the evidence defeats SAFE-3
 * more quietly than no citation would, because the whole point is that the
 * athlete can calibrate how much to trust a claim about their body.
 *
 * **Collapsed to one line by default** (`showable-version/26`, Mads,
 * 2026-09-17): once the Coach cited on most turns the list was the largest
 * thing on screen. The line is the heading and the count — "What I drew on
 * · 3" — and opens in place; every reply's list starts closed, the newest
 * too, and nothing is deduplicated across turns. The count needs no
 * translation, so the footer's key-only `t` stays as it is.
 *
 * Renders **nothing at all** when there is nothing to show: no heading, no
 * container. An absent list is honest; an empty one looks broken.
 */
export function CitationList({
  citations,
  heading,
}: {
  citations: Citation[];
  heading: string;
}) {
  const [open, setOpen] = useState(false);
  if (citations.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-1 border-l border-border/60 pl-3">
      <button
        type="button"
        data-citations-toggle=""
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="self-start font-body text-sm uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        {citationSummary(heading, citations.length)}
      </button>
      {open && <CitationEntries citations={citations} />}
    </div>
  );
}

/** Pure: the collapsed line — the heading and how many sources sit behind it. */
export function citationSummary(heading: string, count: number): string {
  return `${heading} · ${count}`;
}

/** The sources themselves, as they have always rendered: a linked or plain title, then the attribution. */
export function CitationEntries({ citations }: { citations: Citation[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {citations.map((c) => (
        <li
          key={c.sourceId}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {c.url ? (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {c.title}
            </a>
          ) : (
            // A source with no stable link renders unlinked rather than as a
            // dead entry — decided in `retrieval.ts`'s `citationUrl`.
            <span>{c.title}</span>
          )}{' '}
          {/* CC BY requires the attribution to travel with the material. */}
          <span className="text-muted-foreground">· {c.attribution}</span>
        </li>
      ))}
    </ul>
  );
}
