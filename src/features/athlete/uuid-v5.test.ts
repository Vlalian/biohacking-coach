import { describe, it, expect } from 'vitest';
import { uuidV5 } from './uuid-v5';
import { seedAthleteSessionId } from './seed-history';

describe('uuidV5', () => {
  it('derives the same v5 UUID for the same namespace and name, a different one for a different name', () => {
    const ns = 'f2a6c5e1-7b3d-4c8e-9a1f-5d4e3c2b1a09';
    const a = uuidV5(ns, 'alpha');
    expect(a).toBe(uuidV5(ns, 'alpha'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidV5(ns, 'beta')).not.toBe(a);
    expect(uuidV5('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a', 'alpha')).not.toBe(a);
  });

  it('is the function behind seedAthleteSessionId', () => {
    expect(seedAthleteSessionId('8d1d368a-361d-4e80-9098-b07988592543')).toBe(
      uuidV5('f2a6c5e1-7b3d-4c8e-9a1f-5d4e3c2b1a09', '8d1d368a-361d-4e80-9098-b07988592543'),
    );
  });
});
