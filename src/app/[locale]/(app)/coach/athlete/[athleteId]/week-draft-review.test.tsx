import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `training-architecture/17` — the Head Coach's two new surfaces on the plan
 * tab, first render. `renderToStaticMarkup` like `block-panel.test.tsx`: what
 * is asserted is what is in the markup, and what is not.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The server actions' import chains reach auth and the database; a first
// render never calls them.
vi.mock('./week-draft-actions', () => ({ approveWeekDraftAction: vi.fn() }));
vi.mock('./day-actions', () => ({ setWeeklySessionDayAction: vi.fn() }));

const { WeekDraftReview } = await import('./week-draft-review');

const DRAFT = {
  id: 'd1',
  weekStart: '2026-09-21',
  visibleFrom: '2026-09-17',
  sessions: [
    { date: '2026-09-22', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: 'easy spin' },
    { date: '2026-09-24', type: 'Intensity' as const, durationMinutes: 45, zone: null, note: null },
    { date: '2026-09-27', type: 'Endurance' as const, durationMinutes: 150, zone: 'Z2', note: 'long ride' },
  ],
  citations: [],
  approved: false,
  createdAt: new Date('2026-09-16T06:00:00Z'),
};

describe('WeekDraftReview', () => {
  const html = renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={DRAFT} />);

  it('renders one row per proposed session with day, type, minutes, zone and note all editable', () => {
    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html).toContain('2026-09-22');
    expect(html).toContain('2026-09-27');
    // Two selects per row: the day and the type. Mads, 2026-09-16: the coach
    // adjusts the preview as much as possible, so a session can move.
    expect(html.match(/<select\b/g)).toHaveLength(6);
    expect(html.match(/<input type="number"/g)).toHaveLength(3);
    expect(html).toMatch(/<textarea[^>]*>easy spin<\/textarea>/);
  });

  it('renders each session as a card: the four short fields marked on line one, the note a full-width textarea below (training-architecture/31)', () => {
    // Mads, 2026-09-18: "way too much information in one go; the note could
    // be wider". One card per session, keyed as the rows were; every short
    // field keeps its `data-field` marker so a test can find it.
    const cards = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.match(/data-field="date"/g)).toHaveLength(1);
      expect(card.match(/data-field="type"/g)).toHaveLength(1);
      expect(card.match(/data-field="durationMinutes"/g)).toHaveLength(1);
      expect(card.match(/data-field="zone"/g)).toHaveLength(1);
      const note = card.match(/<textarea [^>]*>/g) ?? [];
      expect(note).toHaveLength(1);
      expect(note[0]).toContain('data-field="note"');
      expect(note[0]).toMatch(/class="[^"]*w-full/);
      expect(card.match(/data-action="remove"/g)).toHaveLength(1);
      // The note comes after the four short fields, on its own line.
      expect(card.indexOf('data-field="zone"')).toBeLessThan(card.indexOf('data-field="note"'));
    }
    // The textarea's value is the session's note, or empty when there is none.
    expect(cards[0]).toMatch(/<textarea[^>]*>easy spin<\/textarea>/);
    expect(cards[1]).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(cards[2]).toMatch(/<textarea[^>]*>long ride<\/textarea>/);
    // No note is a single-line input any more.
    expect(html).not.toMatch(/<input[^>]*data-field="note"/);
  });

  it('grows the note with its text: rows follow the line count, with `field-sizing: content` where the browser has it', () => {
    const twoLines = renderToStaticMarkup(
      <WeekDraftReview athleteId="a1" draft={{ ...DRAFT, sessions: [{ ...DRAFT.sessions[0], note: 'easy spin\nkeep it flat' }] }} />,
    );
    expect(twoLines).toMatch(/<textarea[^>]*rows="2"[^>]*>easy spin\nkeep it flat<\/textarea>/);
    // An empty note still shows one line to type into.
    expect(html.match(/<textarea[^>]*rows="1"/g)).toHaveLength(3);
    expect(html).toMatch(/<textarea[^>]*class="[^"]*field-sizing-content/);
  });

  it('offers a session exactly the seven days of the draft’s week to move to, the stored day selected', () => {
    // The server refuses any day outside the draft's week, so the panel never
    // offers one. Monday the 21st through Sunday the 27th, nothing else.
    const daySelect = html.match(/<select[^>]*data-field="date"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? '';
    const options = daySelect.match(/<option value="\d{4}-\d{2}-\d{2}"/g) ?? [];
    expect(options).toHaveLength(7);
    expect(daySelect).toContain('value="2026-09-21"');
    expect(daySelect).toContain('value="2026-09-27"');
    expect(daySelect).not.toContain('value="2026-09-20"');
    expect(daySelect).not.toContain('value="2026-09-28"');
    expect(daySelect).toMatch(/<option value="2026-09-22"[^>]*selected/);
  });

  it('offers remove on every row and one add, beside the one approve', () => {
    expect(html).toContain('data-draft-id="d1"');
    expect(html.match(/data-action="remove"/g)).toHaveLength(3);
    expect(html.match(/data-action="add"/g)).toHaveLength(1);
    expect(html.match(/data-action="approve"/g)).toHaveLength(1);
    expect(html).toContain('lead(week=2026-09-21)');
  });

  it('is keyed by the draft id where the plan page renders it, so a refreshed draft never inherits the old rows', () => {
    // `router.refresh()` keeps client state across new props. Without a key,
    // a replaced draft would arrive into the previous draft's edited rows and
    // approve would send those rows under the new id (CodeRabbit, PR #69;
    // the same fix the block panel got on PR #65).
    const page = readFileSync(fileURLToPath(new URL('./plan/page.tsx', import.meta.url)), 'utf8');
    expect(page).toMatch(/<WeekDraftReview[\s\S]*?key=\{[^}]*pendingDraft[^}]*\}/);
  });

  it('the plan page renders the drafting card off view.draftInFlight, below the review panel (training-architecture/29)', () => {
    const page = readFileSync(fileURLToPath(new URL('./plan/page.tsx', import.meta.url)), 'utf8');
    expect(page).toMatch(/view\.draftInFlight && \(\s*<DraftingCard weekStart=\{view\.draftInFlight\.weekStart\} waiter=\{\{ side: 'coach', athleteId \}\} \/>/);
    expect(page.indexOf('<WeekDraftReview')).toBeLessThan(page.indexOf('<DraftingCard'));
  });

  it('renders nothing when there is no draft, and nothing once the draft is the approved version', () => {
    expect(renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={null} />)).toBe('');
    expect(renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={{ ...DRAFT, approved: true }} />)).toBe('');
  });

  it('still offers add and approve on a draft the Coach left empty — the coach can build the week from nothing', () => {
    const empty = renderToStaticMarkup(<WeekDraftReview athleteId="a1" draft={{ ...DRAFT, sessions: [] }} />);
    expect(empty.match(/<li\b/g)).toBeNull();
    expect(empty.match(/data-action="add"/g)).toHaveLength(1);
    expect(empty.match(/data-action="approve"/g)).toHaveLength(1);
  });
});
