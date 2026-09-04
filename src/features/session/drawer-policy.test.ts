import { describe, it, expect } from 'vitest';
import { athleteDrawerPolicy, headCoachDrawerPolicy } from './drawer-policy';
import { canHeadCoachEditContent } from '@/features/coach/head-coach-authority';
import { isFrozen } from './move-rules';

/**
 * What a Session Drawer offers each of its two audiences.
 *
 * The rules themselves live in `head-coach-authority.ts` and `move-rules.ts`
 * and are tested there. What is proven here is that this policy *asks* them —
 * a second copy of "which origins may be edited", living in a component, is how
 * the affordance and the guard that refuses the write drift apart.
 */

const TODAY = '2026-09-04'; // Friday; the week runs Mon 08-31 – Sun 09-06.
const ORIGINS = ['coach', 'head_coach', 'athlete', 'garmin'] as const;

const at = (over: Partial<{ origin: string; status: string; date: string }> = {}) => ({
  origin: 'coach',
  status: 'planned',
  date: TODAY,
  ...over,
});

describe('athleteDrawerPolicy', () => {
  it('offers content actions on the athlete&apos;s own session', () => {
    const p = athleteDrawerPolicy(at({ origin: 'athlete' }));

    expect(p.content).toBe(true);
    expect(p.contentRefusal).toBeNull();
  });

  it('withholds them on anything the athlete did not author', () => {
    for (const origin of ['coach', 'head_coach', 'garmin']) {
      expect(athleteDrawerPolicy(at({ origin })).content).toBe(false);
    }
  });

  it('does not explain the absence, which is the established behaviour', () => {
    // Deliberate, and about audience rather than consistency: an athlete does
    // not benefit from being told why they cannot edit the Coach's session
    // every time they open one (CONTEXT.md, Session Drawer).
    expect(athleteDrawerPolicy(at()).explainsRefusals).toBe(false);
  });

  it('keeps the status actions and Discuss, whatever the origin', () => {
    // Content is the Coach's; placement and reality stay the athlete's. Skipping
    // a Prescribed Session records what happened and is never gated on origin.
    for (const origin of ORIGINS) {
      const p = athleteDrawerPolicy(at({ origin }));
      expect(p.ownReport).toBe(true);
      expect(p.discuss).toBe(true);
    }
  });
});

describe('headCoachDrawerPolicy', () => {
  it('offers content actions on a session the coach may edit', () => {
    for (const origin of ['coach', 'head_coach']) {
      const p = headCoachDrawerPolicy(at({ origin }), TODAY);
      expect(p.content, origin).toBe(true);
      expect(p.contentRefusal, origin).toBeNull();
    }
  });

  it('names the athlete&apos;s own session as theirs', () => {
    const p = headCoachDrawerPolicy(at({ origin: 'athlete' }), TODAY);

    expect(p.content).toBe(false);
    expect(p.contentRefusal).toBe('athletes-own');
  });

  it('names an imported activity as the record, even in a past week', () => {
    // Ordered ahead of frozen deliberately: an import is the record first and
    // frozen second, and "frozen" would suggest it becomes editable with time.
    const p = headCoachDrawerPolicy(
      at({ origin: 'garmin', status: 'completed', date: '2026-08-26' }),
      TODAY,
    );

    expect(p.contentRefusal).toBe('imported-record');
  });

  it('names a completed coach session as the frozen record', () => {
    const p = headCoachDrawerPolicy(at({ status: 'completed' }), TODAY);

    expect(p.content).toBe(false);
    expect(p.contentRefusal).toBe('frozen-record');
  });

  it('names a session in a past week as frozen too', () => {
    const p = headCoachDrawerPolicy(at({ date: '2026-08-26' }), TODAY);

    expect(p.content).toBe(false);
    expect(p.contentRefusal).toBe('frozen-record');
  });

  it('never offers a status action, a reflection or Discuss', () => {
    // Completing a session is a claim that training happened in someone else's
    // body; a reflection is that person's report of it. The Head Coach outranks
    // the AI but not reality (ADR 0003). Discuss is meaningless: they are the
    // coach.
    for (const origin of ORIGINS) {
      for (const status of ['planned', 'completed', 'skipped', 'unavailable']) {
        const p = headCoachDrawerPolicy(at({ origin, status }), TODAY);
        expect(p.ownReport, `${origin}/${status}`).toBe(false);
        expect(p.discuss, `${origin}/${status}`).toBe(false);
      }
    }
  });

  it('always explains an absence, unlike the athlete&apos;s drawer', () => {
    for (const origin of ORIGINS) {
      expect(headCoachDrawerPolicy(at({ origin }), TODAY).explainsRefusals).toBe(true);
    }
  });

  it('refuses an origin it has never heard of, rather than assuming', () => {
    // The fallback exists for an origin the model gains later. "Not yours to
    // edit" is the safe answer for a session whose author this function cannot
    // identify, and it must not quietly become "yes".
    const p = headCoachDrawerPolicy(at({ origin: 'some_future_origin' }), TODAY);

    expect(p.content).toBe(false);
    expect(p.contentRefusal).toBe('authors-content');
  });

  it('agrees with canHeadCoachEditContent rather than re-listing origins', () => {
    // The guard the server actually applies. A live, unfrozen session is
    // editable exactly when that function says so — no second list.
    for (const origin of ORIGINS) {
      const p = headCoachDrawerPolicy(at({ origin }), TODAY);
      expect(p.content, origin).toBe(canHeadCoachEditContent(origin));
    }
  });

  it('never offers content on a session move-rules calls frozen', () => {
    // The record is immutable for everyone. Asserted against isFrozen so this
    // cannot quietly diverge from the rule the calendar applies.
    for (const origin of ORIGINS) {
      for (const date of [TODAY, '2026-08-26']) {
        for (const status of ['planned', 'completed']) {
          const frozen = isFrozen({ date, status }, TODAY);
          const p = headCoachDrawerPolicy(at({ origin, status, date }), TODAY);
          if (frozen) expect(p.content, `${origin}/${status}/${date}`).toBe(false);
        }
      }
    }
  });
});
