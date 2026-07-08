Status: done

# 02 — Weekly Session Day Preference

## Parent

`.scratch/weekly-session-date/PRD.md`

## What to build

Read the athlete's stored `weeklySessionDay` preference from the profile and use it to refine the planning horizon in the Weekly Session. When the athlete's preferred day matches today, the week-start calculation from issue 01 confirms this is the intended session and plans accordingly. When it does not match, the Coach may ask a brief clarifying question: "Shall I plan for the remainder of this week, or for next week?"

This is a small prompt-side enhancement on top of the day-sensitive calculation in issue 01 — it makes the app aware of the athlete's rhythm rather than purely reactive to the current day.

## Acceptance criteria

- [ ] An athlete with `weeklySessionDay: "Monday"` who runs the Weekly Session on Monday receives a plan for the current week without a clarifying question
- [ ] An athlete running the Weekly Session on a day that does not match their stored preference is offered a choice of this week vs next week
- [ ] An athlete with `weeklySessionDay: "Flexible"` or no preference set gets the day-sensitive default from issue 01

## Blocked by

`.scratch/mcq-onboarding/issues/03-profile-fields-constraints-and-day.md`
