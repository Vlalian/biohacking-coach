import { describe, expect, it } from 'vitest';
import { toCoachingLink } from './coach';

const row = (status: string) => ({
  id: 'l1',
  coachId: 'c1',
  athleteId: 'a1',
  status,
  shareAthleteReports: true,
  shareAiTranscripts: false,
  createdAt: new Date('2026-07-01'),
  severedAt: null,
});

describe('toCoachingLink — status is fail-closed', () => {
  it('only an explicit active is active; any other stored status reads as severed', () => {
    // The schema's check allows only 'active' and 'severed', and every read
    // filters on active. This is the belt behind both: an unexpected value
    // resolves to no access rather than to access.
    expect(toCoachingLink(row('active')).status).toBe('active');
    expect(toCoachingLink(row('severed')).status).toBe('severed');
    expect(toCoachingLink(row('weird_value')).status).toBe('severed');
  });
});
