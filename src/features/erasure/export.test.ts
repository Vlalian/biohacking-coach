import { describe, it, expect } from 'vitest';
import { exportFilename, toAthleteExport, type ExportInput } from './export';

const EMPTY: ExportInput = {
  account: null,
  athlete: null,
  sessions: [],
  sessionStreams: [],
  events: [],
  conversations: [],
  messages: [],
  unavailableDates: [],
  equipmentItems: [],
  consents: [],
  coachingLinks: [],
};

const NOW = new Date('2026-08-27T10:30:00.000Z');

describe('toAthleteExport', () => {
  // Articles 15 and 20 give the athlete a copy of *their personal data*, and
  // their name and email are theirs. This is the one place identity and training
  // data are legitimately rejoined — at their request, for them alone.
  it('includes the account name and email', () => {
    const doc = toAthleteExport(
      { ...EMPTY, account: { name: 'Test Person', email: 'test@example.com' } },
      NOW,
    );

    expect(doc.account).toEqual({ name: 'Test Person', email: 'test@example.com' });
  });

  it('carries every table it was given, so nothing silently falls out of the copy', () => {
    const doc = toAthleteExport(
      {
        ...EMPTY,
        sessions: [{ id: 's1' }],
        messages: [{ id: 'm1', content: 'hello' }],
        consents: [{ purpose: 'ai_coaching' }],
      },
      NOW,
    );

    expect(doc.sessions).toEqual([{ id: 's1' }]);
    expect(doc.messages).toEqual([{ id: 'm1', content: 'hello' }]);
    expect(doc.consents).toEqual([{ purpose: 'ai_coaching' }]);
  });

  it('invents nothing that was not read', () => {
    // The document is exactly the input plus the stamp. If a key ever appears
    // here that no read produced, the export is claiming to hold something the
    // app does not.
    const doc = toAthleteExport(EMPTY, NOW);

    expect(Object.keys(doc).sort()).toEqual(
      ['exportedAt', ...Object.keys(EMPTY)].sort(),
    );
  });

  it('dates the copy so a file found later says when it was taken', () => {
    expect(toAthleteExport(EMPTY, NOW).exportedAt).toBe('2026-08-27T10:30:00.000Z');
  });
});

describe('exportFilename', () => {
  it('is dated and does not name the person', () => {
    expect(exportFilename(NOW)).toBe('biohacking-coach-export-2026-08-27.json');
  });
});
