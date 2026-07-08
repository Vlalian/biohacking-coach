// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { coachGreeting } from '../public/js/onboarding.js';

describe('coachGreeting — name and race present', () => {
  it('greets by name', () => {
    expect(coachGreeting('Mads', 'Ironman Copenhagen').intro)
      .toBe("Hello Mads. I'm your Coach.");
  });
  it('states race target', () => {
    expect(coachGreeting('Mads', 'Ironman Copenhagen').body)
      .toBe("Ironman Copenhagen is your target. Let's get to work.");
  });
});

describe('coachGreeting — name missing', () => {
  it('uses generic intro', () => {
    expect(coachGreeting('', 'Ironman Copenhagen').intro)
      .toBe("I'm your Coach.");
  });
  it('still states race in body', () => {
    expect(coachGreeting('', 'Ironman Copenhagen').body)
      .toBe("Ironman Copenhagen is your target. Let's get to work.");
  });
});

describe('coachGreeting — race missing', () => {
  it('still greets by name', () => {
    expect(coachGreeting('Mads', '').intro)
      .toBe("Hello Mads. I'm your Coach.");
  });
  it('uses generic body', () => {
    expect(coachGreeting('Mads', '').body)
      .toBe("Let's get to work.");
  });
});

describe('coachGreeting — neither name nor race', () => {
  it('generic intro', () => {
    expect(coachGreeting('', '').intro).toBe("I'm your Coach.");
  });
  it('generic body', () => {
    expect(coachGreeting('', '').body).toBe("Let's get to work.");
  });
});
