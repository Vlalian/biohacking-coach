Title: Monthly calendar grid
Status: done

## What to build

Render a monthly calendar grid inside the Training Plan view. Weeks are rows, Mon–Sun are columns. The current month is shown by default. Today's date is highlighted. Past days within the month are rendered at reduced opacity. No session data yet — this slice establishes the grid structure and visual chrome only.

## Acceptance criteria

- [ ] Grid renders current month with correct day/date alignment
- [ ] Week rows run Mon–Sun
- [ ] Today's date is visually highlighted
- [ ] Past days are greyed out (reduced opacity)
- [ ] Grid is scrollable if content overflows
- [ ] Matches the existing dark theme (--bg, --surface, --border, --accent palette)

## Blocked by

- 02-view-switching
