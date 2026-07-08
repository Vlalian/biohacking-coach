Title: Day expansion — tap to reveal session detail
Status: done

## What to build

Tapping a calendar day that has a session expands it inline to show the full Planned Session detail: session type, key parameters (duration, intensity zone), and the Coach's one-line note explaining the reasoning. Tapping the same day again collapses it. Only one day can be expanded at a time — expanding a new day collapses the previous one.

## Acceptance criteria

- [ ] Tapping a day with a session expands it inline below the day cell
- [ ] Expanded view shows: session type, duration, intensity zone, Coach note
- [ ] Tapping the expanded day again collapses it
- [ ] Expanding a second day auto-collapses the first
- [ ] Tapping a rest day or empty day does nothing
- [ ] Expansion animation is smooth

## Blocked by

- 04-mock-session-dots
