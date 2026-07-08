Status: done

# 01 — Day-Sensitive Week-Start Calculation

## Parent

`.scratch/weekly-session-date/PRD.md`

## What to build

Replace the current fixed "next Monday" logic with a day-sensitive `getWeekStartKey(today)` function. If today is Monday, the Weekly Session plans from today. If today is any other day, it plans from the most recent Monday (start of the current week).

Update the Weekly Session system prompt to reflect the correct planning horizon — "remaining days of this week" rather than "next week" — when the calculation returns the current week.

## Acceptance criteria

- [ ] Running a Weekly Session on a Monday produces a plan starting from today, not the following Monday
- [ ] Running a Weekly Session on a Wednesday produces a plan covering the remaining days of the current week
- [ ] The Coach's plan proposal in the Planning phase reflects the correct dates
- [ ] The week-start key used to store the week plan matches the day-sensitive calculation

## Blocked by

None — can start immediately.
