Title: Mock session data + colour-coded dots
Status: done

## What to build

Populate the calendar grid with hardcoded Planned Session data keyed to the Training Phase selected in the check-in form. Each day with a session shows a colour-coded dot: Endurance=blue, Intensity=red, Tempo=amber (#c9a96e), Recovery=green (#6db36d), Rest=grey. Dot style encodes status: outline=planned (future days), solid=completed (past days), muted=skipped. Session data should cover the current month and at least 2 weeks ahead per phase.

## Acceptance criteria

- [ ] Each Training Phase has a distinct hardcoded session schedule
- [ ] Dots appear on the correct days with correct colours per session type
- [ ] Future days show outline dots (planned)
- [ ] Past days show solid dots (completed) or muted dots (skipped)
- [ ] Switching Training Phase in the check-in updates the calendar dots
- [ ] Rest days show no dot or a grey dot

## Blocked by

- 03-monthly-calendar-grid
