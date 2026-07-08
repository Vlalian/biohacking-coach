Status: done

# PRD — RPE Color Coding

## Problem Statement

The RPE buttons (1–10) in the Session Feedback modal are visually uniform — all buttons look identical regardless of value. An athlete selecting RPE 9 gets no visual cue that this is near-maximal effort. The scale feels abstract and clinical rather than intuitive.

## Solution

Apply a green-to-red color gradient across the RPE button rows so that the effort level is immediately readable at a glance. Low values are green (easy), middle values are yellow/orange (moderate), high values are red (hard/maximal). Applied to both Body and Mind RPE rows.

## User Stories

1. As an Ironman trainee, I want RPE buttons to be color-coded so I can read my effort level at a glance without interpreting a number.
2. As an Ironman trainee, I want green buttons for low RPE values so that easy sessions feel visually calm.
3. As an Ironman trainee, I want red buttons for high RPE values so that hard efforts are visually distinct.
4. As an Ironman trainee, I want the selected button's color to remain visible when highlighted so the selection is clear.
5. As an Ironman trainee, I want both the Body and Mind RPE rows to use the same color scheme so the interface is consistent.

## Implementation Decisions

### Color scheme

- 1–3: green
- 4–6: yellow/orange
- 7–9: orange/red
- 10: dark red

Colors are applied as CSS classes or inline styles on the button elements. The selected state (highlighted button) should preserve the color — not override it to a flat highlight color.

### Scope

This is a purely visual change. No logic changes, no storage changes, no prompt changes. Only the rendering of RPE buttons is affected.

The color values should use the existing CSS variable system if one is present, or be defined as a small set of constants alongside the existing `RPE_LABELS` array.

## Testing Decisions

Good tests verify visual behavior through the rendered output, not implementation details.

**Seam:** the rendered RPE button element. Given an RPE value, the button carries the correct color class or style.

Manual verification is sufficient for the POC: open the Session Feedback modal, confirm that buttons 1–3 appear green, 4–6 yellow/orange, 7–9 orange/red, and 10 dark red. Confirm selected state is visible and color-preserving.

## Out of Scope

- Gradient between individual button values (e.g. button 4 is slightly different from button 6) — flat bands per range are sufficient
- Dark mode color variants
- Accessible color alternatives for color-blind users — noted for V1

## Further Notes

This change makes the RPE scale self-explanatory for new athletes who have not yet memorised what each number means. The color provides the intuitive anchor that the label text reinforces.

## Comments

- 2026-07-08 — tracker sweep (Project Ground Truth): all child issues done and feature verified present in the POC. Status set to done.
