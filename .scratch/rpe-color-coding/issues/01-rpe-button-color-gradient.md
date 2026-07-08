Status: done

# 01 — RPE Button Color Gradient

## Parent

`.scratch/rpe-color-coding/PRD.md`

## What to build

Apply a green-to-red color gradient across the RPE buttons (1–10) in the Session Feedback modal. Both the Body and Mind RPE rows receive the same color scheme. Low values are green, middle values yellow/orange, high values orange/red, and 10 is dark red.

Color bands:
- 1–3: green
- 4–6: yellow/orange
- 7–9: orange/red
- 10: dark red

The selected button's highlight must preserve its band color — not override it with a flat highlight. Unselected buttons show the color at reduced opacity or as a border/tint so the scale is readable before selection.

## Acceptance criteria

- [ ] RPE buttons 1–3 render with a green color treatment
- [ ] RPE buttons 4–6 render with a yellow/orange color treatment
- [ ] RPE buttons 7–9 render with an orange/red color treatment
- [ ] RPE button 10 renders with a dark red color treatment
- [ ] The selected button is visually distinct and its band color is still visible
- [ ] Both the Body and Mind RPE rows use the same color scheme
- [ ] Color treatment is visible before any selection is made

## Blocked by

None — can start immediately.
