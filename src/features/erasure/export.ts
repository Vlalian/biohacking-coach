/**
 * The athlete's own copy of everything the app holds about them
 * (`showable-version/10`; `docs/nfr.md` PRIV-3, the "export" half).
 *
 * Pure: rows in, one document out. The reads live in
 * {@link ./export-repository}, and the same document is served by the download
 * route and printed by `npm run export`, so there is one answer to "what does
 * the app hold about me" rather than two that can drift.
 *
 * **This one deliberately carries identity**, which makes it the exception to
 * ADR 0006 rather than a violation of it. Articles 15 and 20 give the athlete a
 * copy of *their personal data*, and their name and email are theirs. The
 * separation ADR 0006 enforces is between training data and identity in *the
 * app's own reads*; handing the person their own file back is the one place the
 * two are legitimately rejoined, at their request and for them alone.
 *
 * Rows are exported close to as stored rather than prettied up. A portability
 * export is meant to be complete and machine-readable, not a report — reshaping
 * it would mean deciding what to leave out.
 */

/** Everything the reads produce, before it is assembled into a document. */
export interface ExportInput {
  /** From better-auth's `user` row — the athlete's own identity, returned to them. */
  account: { name: string; email: string } | null;
  athlete: unknown;
  sessions: unknown[];
  sessionStreams: unknown[];
  events: unknown[];
  conversations: unknown[];
  messages: unknown[];
  unavailableDates: unknown[];
  equipmentItems: unknown[];
  consents: unknown[];
  coachingLinks: unknown[];
}

export interface AthleteExport extends ExportInput {
  /** ISO stamp of when the copy was taken, so a file found later dates itself. */
  exportedAt: string;
}

/**
 * Assembles the export document.
 *
 * The clock is a parameter rather than read here, so the function stays pure and
 * the document is reproducible in a test.
 */
export function toAthleteExport(input: ExportInput, now: Date): AthleteExport {
  return { exportedAt: now.toISOString(), ...input };
}

/**
 * The download filename. Dated, and named for the app rather than for the
 * person — a file in a downloads folder should not announce whose health data
 * it is to anyone glancing at the screen.
 */
export function exportFilename(now: Date): string {
  return `biohacking-coach-export-${now.toISOString().slice(0, 10)}.json`;
}
