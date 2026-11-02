/**
 * The four pictures of the app the Frontpage frames (showable-version/62). Each
 * `src` is empty until real pictures from the seed accounts exist, and an empty
 * frame shows the "Demo screenshot to follow" placeholder.
 */
export type FrontpageImage = { src: string; alt: string };

export type FrontpageScreenshots = {
  rosterView: FrontpageImage;
  coachChat: FrontpageImage;
  trainingPlan: FrontpageImage;
  informationView: FrontpageImage;
};

const empty: FrontpageImage = { src: '', alt: '' };

export const frontpageScreenshots: FrontpageScreenshots = {
  rosterView: empty,
  coachChat: empty,
  trainingPlan: empty,
  informationView: empty,
};
