Status: done

# 01 — RPE 1–10 feedback scale

## Parent

`.scratch/expert-feedback-poc-updates/PRD.md`

## What to build

Replace the two 5-button emoji rows in the Session Feedback Prompt with two 10-button RPE rows — one for Body Feedback, one for Mind Feedback. Each button displays its number (1–10). When a button is selected, an illustrative label appears below the row describing what that RPE value means. The Save button remains disabled until both dimensions are rated.

RPE label text per value:
- 1–2: "Barely any effort"
- 3–4: "Easy — comfortable and sustainable"
- 5–6: "Moderate — some effort required"
- 7–8: "Hard — uncomfortable but manageable"
- 9: "Very hard — near your limit"
- 10: "Maximum — couldn't do more"

Use a single label that covers the range for values 1–2, 3–4, 5–6, 7–8 (i.e. selecting 1 or 2 shows the same label). Values 9 and 10 each have their own label.

Storage format changes from `{ body: 1–5, mind: 1–5 }` to `{ body: 1–10, mind: 1–10 }`. Existing localStorage entries with old values are silently ignored — no migration needed in the POC.

The `preload: true` / `preload: false` distinction (edit vs. new session) is unchanged — editing a previously rated session still pre-fills the stored values.

The modal header title and session type label are unchanged.

## Acceptance criteria

- [ ] Session Feedback Prompt shows two rows of 10 numbered buttons (1–10) instead of 5 emoji buttons
- [ ] Selecting a button highlights it and shows the correct RPE label text below the row
- [ ] Selecting a different button in the same row moves the highlight and updates the label
- [ ] Save is disabled until both Body and Mind are rated
- [ ] Saving stores `{ body: N, mind: N }` where N is 1–10
- [ ] Opening the prompt to edit a previous rating pre-fills the correct button for each dimension
- [ ] Opening the prompt for a new session (via "Rate this session") shows no pre-selection
- [ ] The calendar's "Edit rating" flow also opens with the stored RPE values pre-filled

## Blocked by

None — can start immediately.
