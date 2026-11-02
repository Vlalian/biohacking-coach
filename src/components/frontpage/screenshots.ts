/**
 * The four pictures of the app the Frontpage frames (showable-version/62). An
 * empty `src` shows the "Demo screenshot to follow" placeholder; the real
 * pictures (showable-version/63) are taken from the seed accounts by
 * `npm run frontpage:screenshots` and live in `public/frontpage/`.
 */
export type FrontpageImage = { src: string; alt: string };

export type FrontpageScreenshots = {
  rosterView: FrontpageImage;
  coachChat: FrontpageImage;
  trainingPlan: FrontpageImage;
  informationView: FrontpageImage;
};

/** The `Frontpage` catalogue keys of the four pictures' alt texts. */
export type FrontpageAltKey = 'altRosterView' | 'altCoachChat' | 'altTrainingPlan' | 'altInformationView';

/** The four real pictures, each with its alt text in the reader's locale. */
export function frontpageScreenshotsFor(t: (key: FrontpageAltKey) => string): FrontpageScreenshots {
  return {
    rosterView: { src: '/frontpage/roster-view.png', alt: t('altRosterView') },
    coachChat: { src: '/frontpage/coach-chat.png', alt: t('altCoachChat') },
    trainingPlan: { src: '/frontpage/training-plan.png', alt: t('altTrainingPlan') },
    informationView: { src: '/frontpage/information-view.png', alt: t('altInformationView') },
  };
}
