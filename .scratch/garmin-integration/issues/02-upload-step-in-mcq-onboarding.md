Status: done

# 02 — Historical Data Upload Step in MCQ Onboarding

## Parent

`.scratch/garmin-integration/PRD.md`

## What to build

Add an optional historical data upload step to the MCQ onboarding flow for intermediate and veteran athletes. The step appears after the experience-adaptive clarifying questions and before completion.

The screen shows: "Upload your recent training history (optional) — .fit or .gpx files from Garmin, Wahoo, or compatible devices." A file picker allows selecting multiple files. On upload, files are sent to `POST /api/garmin/upload` (implemented in issue 01). The returned session array is stored in localStorage as the initial session history.

Beginners do not see this step. The step is explicitly skippable — "Skip for now" proceeds to onboarding completion without uploading.

A progress indicator is shown during upload since parsing multiple files may take a moment.

## Acceptance criteria

- [ ] Veteran and intermediate athletes see the upload step during onboarding
- [ ] Beginner athletes do not see the upload step
- [ ] The file picker accepts `.fit` and `.gpx` files
- [ ] Multiple files can be selected and uploaded in one step
- [ ] A progress indicator is shown during upload
- [ ] Uploaded sessions appear in the Training Plan calendar after onboarding completes
- [ ] "Skip for now" completes onboarding without uploading
- [ ] The Coach references uploaded history in the first session

## Blocked by

`.scratch/mcq-onboarding/issues/01-mcq-flow-core-fields.md`
`.scratch/garmin-integration/issues/01-upload-endpoint-fit-gpx-parsing.md`
