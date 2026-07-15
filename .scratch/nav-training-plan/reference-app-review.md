Status: screenshots reviewed 2026-07-14 (pasted in chat, per privacy rule — not committed). **STARTUP TRUTH decided by Mads 2026-07-14 — see below; it supersedes the "worth stealing / anti-pattern" framing as scope guidance.** Expert questions (§ 13 of the interview guide) remain open but now inform default layouts and validation, not what to include.

## STARTUP TRUTH (Mads, 2026-07-14) — foundation for the initial information page

1. **TrainingPeaks parity:** everything TrainingPeaks has (the panel families inventoried below) should be available and shown in BOTH the athlete UI and the Head Coach UI.
2. **Adjustability:** panels/graphs can be moved and favorited, so each athlete or Head Coach arranges the information they care about most for at-a-glance access. This is the answer to the "panel wall" problem — the user curates, not the app.
3. **Comparison:** the user can compare multiple training sessions (progression) or compare bodily information — the Workout Comparison table generalized into a first-class compare feature.

Consequences: the "mirror vs. mirror+scoreboard" question is resolved (it's everything, user-curated); the anti-patterns section below stands only as *execution* guidance (no dead empty panels — a panel without a data source shouldn't be addable; Coach speech still translates numbers into language — the page showing numbers doesn't change how the Coach talks).

# Reference App Review — TrainingPeaks (athlete expert's account)

Unblocks [issue 09 — Bodily Information page](issues/09-bodily-information-page.md). Also mines calendar and workout-description patterns for the Training Plan, per the 2026-07-09 handoff agreement.

**PRIVACY RULE (Mads, 2026-07-09):** this document records layout patterns, chart types, and terminology only. All example values below are **synthetic**. The expert's real health/training data never gets persisted — not here, not in issues, not in commits.

## Surface inventory

The app has four top-level pages (Home, Calendar, Dashboard, ATP) plus two secondary surfaces we almost missed (a second Dashboard tab, and a drawer inside Calendar).

### 1. Home — Today + Tomorrow

Vertical feed, three columns: Events/Goals (left), Today+Tomorrow (center), Performance Metrics + Peak Performances (right).

- **Events**: next race with countdown ("N weeks until event") and a projected-fitness curve toward race day.
- **Goals**: athlete-entered goals with example prompts (e.g. "Get 8 hours of sleep"); can sit empty.
- **Today**: sleep summary pulled from the wearable (total + deep/light/REM/awake, body battery, stress, resting HR) → completed activities as compact rows (duration, distance, TSS) → today's planned session as a full card: session focus paragraph, warm-up/main-set/cool-down, coaching pointers, session nutrition note, and step-by-step workout details with power/pace targets per step.
- **Today's Training Zones**: full zone tables per discipline — power (bike), HR (bike + run), pace (run + swim), each anchored on a threshold value.
- **Tomorrow**: same session-card format for the next day's planned sessions.
- **Right rail**: Fatigue / Fitness / Form as three big color-coded numbers; fitness ramp rates over 7/28/90/365 days as sparklines; Peak Performances list (recent bests: 5-sec HR, 1-min HR, 5-sec power, distance splits) with dates.

**Pattern worth noting:** the workout-description format (Session Focus → Warm Up → Main Set → Cool Down → Coaching Pointers → Nutrition → per-step targets) is a strong, consistent template. Relevant to our Training Plan session content, not just the info page.

### 2. Dashboard, tab 1 — "Legacy Dashboard" (the information page proper)

A wall of ~20 configurable panels over a selectable date range. Grouped by kind:

- **Load history**: Performance Management chart (fitness/fatigue/form curves over time + daily TSS dots) — the centerpiece.
- **Sport split pies** ×4: completed duration, completed distance, planned duration, planned distance — each split swim/bike/run.
- **Peaks tables** ×2 (HR, power): week-by-week + month-by-month rows with duration, distance, TSS, and best values at 5s/1m/5m/20m/60m.
- **Weekly bars**: longest workout (duration), longest workout (distance), elevation gain, calories — each with a period average line.
- **Time-in-zone**: stacked bars per week (HR / power / speed) + total-period histograms per zone.
- **Peaks curves**: best-effort curves (HR, power) from 5 sec to 60 min; peak pace by distance (run).
- **Power Profile**: athlete's best efforts ranked on a named ladder ("World Champion" … "Fair — Cat 5").
- **Body/subjective**: ONE small panel plotting Sleep Hours + Overall Feeling (Best→Horrible scale) together.
- **Empty-state failure**: panels render dead placeholders when data is missing ("No metrics to report on", "No nutrition data available") instead of hiding.

**Key observation:** on the entire information page, body signals occupy one small panel; everything else is training-output analytics. Our draft scope (check-in trends, body signals today, consistency) covers what this page *lacks*, not what it has.

### 3. Dashboard, tab 2 — Workout Comparison

Flat filterable table, one row per workout: date, name, type/subtype, duration, distance, work (kJ), TSS + variants (hrTSS, rTSS), normalized power, NGP pace, avg power/pace/HR, intensity factor. Columns and filters customizable. A raw-data spreadsheet view — analysis surface, coach-side in spirit.

### 4. ATP — Annual Training Plan

- **Top**: year-at-a-glance, one bar per week, color-coded by period (blue Base, green Build, yellow Peak, red Race, grey Transition/unplanned), darker fill = completed vs planned hours, trophy icon on race week.
- **Bottom**: week table grouped by month: week range, weeks-to-event countdown, event name, priority, period label (e.g. "Base 3 – Week 4"), planned hours, completed hours, and **Limiters per discipline** (swim/bike/run) listing that week's focus qualities (Endurance, Force, Speed Skill, Muscular Endurance, Anaerobic Endurance, Power, "Test"), plus a Strength column.

Terminology note: "Limiters" = per-discipline qualities the week targets. Our phase model (8 phases) maps roughly onto their period labels but they number weeks within periods ("Build 1 – Week 2") — supports our deferred issue 08 (month-aware narrative: week-within-phase).

### 5. Calendar (+ Workout Library drawer)

- Month grid, session cards per day, color-coded by state: green = completed as planned (with planned-vs-actual comparison), white/grey = planned or unrated, **red = missed**. Cards show sport icon, title, duration, distance, TSS, collapsed plan, comment/attachment indicators.
- **Human notes as first-class calendar items**: weekly "time available for training" notes from the athlete, coach annotations ("RECOVERY???", "POTENTIAL 'BIG DAY' WEEK"), even "Birthday!" — the plan is annotated with real life.
- **Right rail per week**: totals per sport (distance, duration, kJ), TSS, that week's Fitness/Fatigue/Form, and the ATP context repeated (period label + limiters).
- **Workout Library drawer**: reusable session templates with sport icon, duration, expected TSS, and a thumbnail of the interval structure. Coach's toolbox — build once, drag onto days.
- Future weeks mostly empty except notes — planning is rolling, not pre-filled season-wide.

## What's worth stealing (hypotheses — expert must confirm usage first)

1. **Fitness/Fatigue/Form as a three-number glance** — the most repeated element in the whole app (home, dashboard, per-week summaries). A candidate "how loaded are you" readout, translated to natural language per our no-raw-scores rule.
2. **Sleep + subjective feeling on one chart** — the single panel that matches our Check-in Trends idea.
3. **Completed vs planned, everywhere** — pies, ATP bars, calendar colors all express the same honest gap; our This Month section (done/skipped/streak) is the simple version.
4. **Weeks-to-event countdown** — cheap, motivating, appears on two pages.
5. **The workout-description template** (Session Focus → sets → pointers → nutrition) — for Coach session content.
6. **Weekly notes as calendar items** — validates our Weekly Session constraints capture; they do it as free-text on the calendar.

## Anti-patterns to avoid

1. **Panel wall** — ~20 panels is a coach's analysis surface, not an athlete's glanceable page; contradicts our invisible-coaching model.
2. **Dead empty-state panels** — never render "no data to report on"; sections without data should not exist on the page.
3. **Raw metric soup** — TSS/hrTSS/rTSS/IF/NGP columns; our Coach translates numbers into language (athlete hears "a genuinely easy week").
4. **Body signals as an afterthought** — one small panel among twenty. Our page inverts this ratio.

## Second mining pass (2026-07-15) — improvement candidates, all ruled on by Mads

A deliberate re-read of all six screenshots after the Information View route shipped. Mads agreed with all twelve dispositions.

**Near-term build (promoted to issues 08–10 in `.scratch/information-view/issues/`):**
1. **Time-range selector** — the dashboard's date range governs every panel; our page always shows all history. Ranked first: it changes what every panel means and multiplies the Comparison Graph.
2. **Recent Bests feed** — their Peak Performances list is a chronological feed of new personal bests with dates. Pure Achievement Motivation; the moments, not just the numbers.
3. **Ramp-rate tiles** — fitness change over 7/28/90/365 days as glanceable tiles with sparklines: "building or fading."

**Build when their data/module arrives (pre-registered, not built):**
4. **Planned vs. completed hours** — the compliance story in hours, not just session counts (needs planned-hours data per week).
5. **Sleep architecture panel** — deep/light/REM/awake, body battery, resting HR, stress; wearable-gated, appears via the one-reading rule when a wearable connects.
6. **My Zones panel** — read-only zone tables per discipline; display surface for the deterministic calc module ("Numbers the Coach Can Trust").
7. **Weekly summary beside the Training Plan calendar** — per-week totals/TSS/F-F-F rail; belongs to the Training Plan, not the Information View.
8. **Session structure thumbnails** — interval-silhouette minis on Session Blocks/Drawer; needs structured session steps.

**Parking lot / expert questions (added to interview guide § 13):**
9. **Race-day projection curve** — forward fitness projection is deterministic math but flirts with Trajectory Projection (deliberately Coach-conversational, V1). Flagged, not built.
10. **Goals** — athlete-entered goals visible to the coach; a new domain concept touching the Weekly Session, not a panel. Parked.
11. **Notes on the calendar** — visible week notes ("time available", "Birthday!") vs. our conversational constraint capture; expert question.

**Deliberately not taken:** Power Profile ranking ladder (world-ranking framing cuts against personal-progression; expert question on motivation vs. discouragement); red missed sessions (contradicts US-3 skipped-session safety); hrTSS/rTSS/IF/NGP metric variants — **kept as a possible later addition** once the calc module exists (Mads, 2026-07-15), not panel material before then.

**12. NEW idea (Mads, 2026-07-15): front-page information selection.** Adjustability should extend beyond this page: the athlete chooses which information/graphs from the Information View also surface on the app's front page (the Coach view / home surface) — chosen and managed *from* the Information View, e.g. via the existing star/favorites mechanism or a separate "pin to front page" control. Essentially the prototype's Glance Strip variant reborn on the home surface. Needs a short design pass (which surface, which control, tile form) before building — issue 11 stub filed as future.

## Open question the screenshots can't answer

What the athlete actually *uses*. Which panels get looked at, how often, and which are noise — this decides mirror vs. mirror+scoreboard for our page. Mads explicitly deferred this to the expert (2026-07-14): questions prepared as § 13 of the interview guide.
