import { describe, it, expect } from 'vitest';
import { frontpageScreenshotsFor } from './screenshots';

/** showable-version/63: the Frontpage's four pictures, each with its alt text from the catalogue. */
describe('frontpageScreenshotsFor', () => {
  it('names the four pictures under /frontpage and takes each alt from the translator', () => {
    expect(frontpageScreenshotsFor((key) => `T:${key}`)).toEqual({
      rosterView: { src: '/frontpage/roster-view.png', alt: 'T:altRosterView' },
      coachChat: { src: '/frontpage/coach-chat.png', alt: 'T:altCoachChat' },
      trainingPlan: { src: '/frontpage/training-plan.png', alt: 'T:altTrainingPlan' },
      informationView: { src: '/frontpage/information-view.png', alt: 'T:altInformationView' },
    });
  });
});
