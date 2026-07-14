Status: round 2 ASKED 2026-07-12 — sections 9, 10, 11 answered by the athlete expert in a live in-chat grill session (in Danish). Full findings summary in PRD.md → Further Notes. Coach-side questions the athlete couldn't answer are compiled in section 12 for the newly recruited human coach (round 3, not yet asked).
Last updated: 2026-07-12. Round 1 interviewed 2026-06-22 (in Danish); key findings incorporated into CONTEXT.md and PRD.md. Round 1 interviewed 2026-06-22 (in Danish); key findings incorporated into CONTEXT.md and PRD.md. See PRD.md → Further Notes for full summary.

# Domain Expert Interview Guide

Questions for Mads's domain expert contact — Ironman trainee under active human coaching, medicine and training background. These are open design decisions that require real coaching and athlete experience to answer well. Group the conversation by section, but follow the expert's energy — don't force the order.

Where the current build has taken a design position, it's noted as **→ Current position** so the expert can validate or challenge it directly.

---

## 1. The Coaching Relationship

**What this drives in the app:** The app's AI Coach speaks with what we call Peer Authority — it makes confident, direct recommendations based on the athlete's state and history, then genuinely invites the athlete's response. It doesn't defer ("you know your body best"), but it also adapts when the athlete gives a good reason to. The Coach holds its position against weak pushback and changes course against strong pushback. These questions test whether that posture matches what real coaching actually looks like, and what builds or erodes athlete trust.

- What does a first session with your human coach actually look like? What does the coach ask, and in what order?
- How does your coach's communication style change across phases — early base vs. peak vs. taper?
- When you push back on a session ("I'm too tired for this today"), how does your coach respond? Do they hold their position or adapt?
- Has your coach ever said "I'm not sure" or "I don't have enough information to call this"? How did that land?
- What has your coach said or done that made you trust them most? What eroded trust?
- Does your coach ever ask you what *you* think you need, before telling you what to do? How does that feel?
- **→ Current position:** The app opens the weekly coaching session by asking the athlete to self-assess before the Coach shares its read — e.g. "How did this week feel before I give you my take?" This is meant to build body awareness and prevent the athlete from becoming passive. Does that match what a real coach does, or does it feel like unnecessary friction?
- How does a real coaching session *end*? Is there a natural closing move, or does the athlete always drive it?

---

## 2. Luxury Positioning for Ironman Athletes

**What this drives in the app:** This is a premium product aimed at serious Ironman athletes, not a free training app. The UX, coaching tone, and product decisions should reflect what "high quality" means for this specific audience. These questions help us understand whether "luxury" means emotional intelligence, data depth, coaching credibility, or something else entirely — so we don't build the wrong kind of premium.

- When you think about the best coaching experience you've had — what made it feel high-quality vs. generic?
- Ironman athletes are achievement-motivated. How does your coach tap into that? Is it explicit ("here's your projected finish time") or more implicit?
- What would make an AI coach feel *insulting* to an experienced Ironman trainee? What would signal it doesn't understand the sport?
- Is calm and measured the right register for this audience, or do Ironman athletes want something more energising? Does it depend on the moment?
- Would you pay more for an AI coach that remembered everything about you vs. one with better training science knowledge? Which matters more?

---

## 3. Experience-Adaptive UX

**What this drives in the app:** The app behaves differently based on the athlete's experience level. A first-time Ironman trainee gets more explanation, more reassurance, and aspirational framing ("here's what consistent training can unlock for you"). A veteran gets terseness, technical vocabulary, and personal progression framing ("here's what your own data shows about where you're headed"). These questions test whether those assumptions are right, and where the line between them actually sits.

- What does a first-time Ironman trainee most need in the first month — motivation, structure, education, or reassurance?
- What does a veteran Ironman trainee find patronising or annoying in a coaching tool?
- **→ Current position:** For Trajectory Projection (the Coach's view of where the athlete is headed), we frame it differently per experience level — beginners get "what consistent training can unlock" (aspirational), veterans get "how your numbers have progressed over time" (retrospective). Does that distinction hold up in practice?
- At what point in an athlete's journey does the focus shift from "what could I become" to "what have I built"?
- **→ Current position:** We've built a weekly planning concept — before the week starts, the Coach asks the athlete about constraints (travel, work, scheduling) and builds the week plan around them. Is that something athletes actively want, or do they prefer the coach to just adapt in the moment when something comes up?

---

## 4. Subjective Experience as Signal

**What this drives in the app:** This is the app's core differentiator. Most training apps track objective metrics — pace, power, heart rate, HRV. This app bets that *subjective experience* — how the body felt and how the mind felt after a session — is equally valuable coaching intelligence when tracked consistently over time. We collect two separate dimensions after every session: Body Feedback (physical effort, sensation, fatigue) and Mind Feedback (mood, motivation, satisfaction). The Coach uses these signals invisibly — not by telling the athlete "your mind score was low," but by quietly adjusting next week's load when mind feedback has been consistently poor. These questions test whether that approach captures the right signals and whether the invisible-use model matches real coaching.

- Does your human coach ask how you *felt* after sessions, not just what your times and power numbers were? How does that information change their recommendations?
- Have you ever had a session where your body felt great but your head was in a bad place, or vice versa? How did your coach handle that divergence?
- **→ Current position:** We treat body signals and mind signals as two separate channels. Do real coaches think about them separately, or as one integrated picture?
- **→ Current position:** The Coach notices patterns across weeks — e.g. "mind feedback consistently low on intensity sessions" or "body feedback drops after weeks with poor sleep" — and uses these patterns silently to shape the next week's plan, without telling the athlete. That matches what we've observed coaches do. Is that right, or would a good coach name the pattern explicitly at some point?
- Has your coach ever spotted a pattern in your responses that you hadn't noticed yourself? What was it, and how did they surface it?
- Would you trust an AI to notice those patterns over time? What would it need to do to earn that trust?

---

## 5. Training Plan Design

**What this drives in the app:** We've built a monthly calendar view showing the athlete's full training plan. Each day shows a colour-coded dot indicating session type (Endurance = blue, Intensity = red, Tempo = amber, Recovery = green) and status (solid = completed, outline = planned, muted = skipped). Tapping a day expands it to show session details and a one-line Coach note explaining the reasoning behind that session. These questions test whether our phase model, session categories, and calendar design match how Ironman athletes actually think about their training.

- **→ Current position:** We've used four session types: Endurance, Intensity, Tempo, Recovery. Are these the right categories for Ironman training? What's missing or conflated?
- **→ Current position:** We've modelled 8 training phases: Early Base Building, Base Building, Build Phase, Peak Phase, Taper, Recovery, Return to Training, Off-season Maintenance. Do these reflect how Ironman periodization actually works, or are there gaps and overlaps?
- We show a monthly calendar view. Is month the right granularity for an Ironman athlete thinking about their plan, or do athletes primarily think in weeks?
- What would a human coach say differently at week 3 of Base Building vs. week 7 of the same phase? Are there concrete differences in emphasis, language, or session focus?
- When you look at your own training plan, what's the most important thing you want to understand at a glance — total load, variety, recovery balance, or something else?
- Does your human coach show you the full training plan in advance, or communicate it week by week? How far ahead do you typically see?

---

## 6. Weekly Rhythm and Daily Interaction

**What this drives in the app:** This is the most significant design change we've made based on early feedback. Originally the app had a daily check-in and daily session recommendation. We've moved to a weekly rhythm: once a week, the athlete has a formal coaching session (self-assessment → last week review → next week plan). Daily touchpoints are now minimal — after each training session, the athlete logs two quick emoji ratings (Body and Mind, 1–5 each) plus an optional comment. The Coach reads these across the week and uses them in the next weekly session. These questions directly validate or challenge that model.

- How often does your human coach communicate with you during a training week? Daily, weekly, or only when something comes up?
- **→ Current position:** We've moved to one formal coaching session per week instead of daily recommendations. Does once-per-week feel like enough contact for serious Ironman training, or would athletes feel underserved between sessions?
- After a particularly hard session, an unexpected illness, or a skipped session, does your coach follow up proactively — or wait for you to raise it?
- **→ Current position:** We've replaced the post-session debrief conversation with a two-emoji rating (Body 1–5, Mind 1–5) and an optional comment. The reasoning: the friction of opening the app and typing a full reflection after a hard session is too high, so most athletes won't do it consistently. Does a quick emoji rating capture enough signal for a coach to work with, or is critical information lost? What specifically would be missing?
- What are the most important things a coach needs to know after a session — beyond "how hard was it"?
- **→ Current position:** Athletes can deviate from the Week Plan on any day (illness, fatigue, schedule conflict) by opening the Coach and negotiating a change. The Coach then rebalances the rest of the week. Is that the right model, or do athletes prefer to just skip without explanation and let the coach adapt automatically?
- Between formal weekly sessions, what kinds of questions do you most commonly ask your coach? (training questions, nutrition, equipment, race logistics, mindset, other?)

---

## 7. The Cold Start Problem

**What this drives in the app:** A new athlete has no history with the Coach. The first session is a structured intake conversation — the Coach asks about fitness background, race target, motivation, training history, and communication preference. This seeds the Athlete Profile. These questions help us understand how quickly a real coach can start making accurate recommendations, and what the intake conversation needs to cover to get there fast.

- What did your coach learn about you in your first session that turned out to be most valuable later?
- What did it take for you to feel like your coach *really* understood you — days, weeks, months?
- **→ Current position:** Once onboarded, we expect the Coach to have enough information to make meaningful recommendations by session 3–5, and to be genuinely personalised by session 10. Is that realistic, or is 10 sessions still early?
- What would make the first two weeks of an AI coaching app feel generic and forgettable vs. surprisingly personal?
- Is there anything a coach could ask in an intake conversation that would immediately signal they understand Ironman training?

---

## 8. Guardrails and Risk

**What this drives in the app:** The Coach makes training recommendations based on athlete-reported signals. It does not have access to medical records, a doctor, or a physiotherapist. These questions define the boundaries — when the Coach should step back, refer to a human, or flag a risk — and what training advice from an AI would feel dangerous or irresponsible to an experienced athlete.

- Has your coach ever told you to see a doctor or stop training entirely? How was that communicated?
- What training advice, if given by an AI, would you immediately distrust or find dangerous?
- If an AI coach gave you advice that contributed to an injury, what would that mean for your trust in AI coaching generally?
- Are there decisions that should always remain with a human professional — physiotherapist, doctor, human coach — and never be made by an AI?
- **[NEW]** The app has access to subjective signals (mood, fatigue, sleep) but not medical data. What are the situations where that gap becomes dangerous — where the athlete might present signals the app would misread as "just tired" when something more serious is happening?

---

## 9. The Draggable Calendar (round 2 — new feature)

**What this drives in the app:** We're redesigning the Training Plan calendar so sessions become draggable blocks. The athlete can expand any week, drag sessions between days, stack multiple training sessions on one day (a Double), and add their own supplemental sessions (Mobility, Strength, Other). The authority model: the athlete owns *where* sessions happen, the Coach owns *what* they are — Coach session content is read-only and undeletable. Rest days are dominant: training can never displace a Rest block; dropping training onto Rest parks it as unavailable until the Rest itself is moved. Moving a session to a *different week* triggers a one-time Coach warning popup (shown only for the athlete's first two cross-week moves, then never again — but the Coach always brings moves up at the next Weekly Session). These questions test whether that authority model matches real coaching.

- When an athlete wants to rearrange their week — swap Tuesday and Saturday, push a session a day — does your coach care, as long as the week's sessions all happen? Where's the line between "fine, your life" and "talk to me first"?
- **→ Current position:** Rest days are untouchable — the athlete can never place training on a planned rest day without first moving the rest day itself. Is absolute rest protection right, or would a real coach allow, say, easy mobility or a swap of rest with an easy spin without ceremony?
- **→ Current position:** Moving a session into a *different week* is treated as a bigger deal than moving within the week, because it changes weekly load distribution. What are the actual downsides a coach would name — load spacing, recovery windows, progression logic? Which matter enough to warn the athlete about in the moment?
- **→ Current position:** We warn about cross-week moves only the first two times, then trust the athlete and let the coach react at the weekly session instead. Does that trust curve match how you'd coach it?
- An athlete skips Tuesday's intensity session, then drags it to Saturday — right before Sunday's long ride. Would your coach tolerate the athlete self-managing that, or intervene before the weekend?
- **→ Current position:** We allow unlimited sessions per day (doubles are normal in Ironman training) and never block stacking in the UI — the coach reacts at the weekly session if the shape looks wrong. Are there stacking patterns dangerous enough (injury risk, not just suboptimal) that the app should step in immediately rather than wait for the weekly session?
- **→ Current position:** Athletes can add their own supplemental sessions: Mobility, Strength, and Other. The Coach plans endurance/intensity/tempo/recovery; the athlete adds extras on top. In real Ironman coaching, who owns strength programming — is strength genuinely athlete-territory, or does your coach program it and this split is wrong?
- How often do you forget to log a session the day you did it? We allow back-filling forgotten sessions within the current week only — is a week enough, or do athletes come back after longer?
- If you could see *how* an athlete rearranges their plan over months (always pushing intensity to weekends, always shifting rest days, always adding stretching after hard days) — what would those patterns tell you as a coach? Which are worth acting on?

## 10. Coached Mode — the human coach layer (round 2 — new feature)

**What this drives in the app:** A future version lets a real human coach (we call them the Head Coach) link to athletes and coach them *through* the app, with the AI Coach as their analyst and always-available assistant. The Head Coach sees the athlete's calendar, reflections, and check-ins (athlete-controlled visibility, doctor-patient confidentiality model), can add and edit sessions directly (the AI never silently changes the human's sessions — it only suggests), and can interrogate the AI about the athlete ("how has her sleep trended?"). The athlete's private chats with the AI stay private unless the athlete opts in. The expert is an athlete under active human coaching — these questions test the whole concept against that real relationship.

- Walk me through how your coach actually plans your week today — what tools, what rhythm, what friction? Where does time get wasted on logistics rather than coaching?
- If your coach could ask an AI that has read all your data anything about you — what would they actually ask? What would they never trust it on?
- **→ Current position:** The AI drafts the week plan from the athlete's data; the human coach edits, adds, or overrides at will, and the AI never touches the human's sessions without permission. Is "AI drafts, human corrects" the right division of labor — or would your coach want to author from scratch?
- **→ Current position:** When the AI thinks the human coach's session should change (athlete got ill, load looks wrong), it sends the coach a suggestion rather than acting. How would your coach feel about an AI second-guessing their programming — useful analyst or annoying backseat driver?
- **→ Current position:** Your private conversations with the AI coach are hidden from your human coach by default — you can opt in to share them. Where would you personally set that toggle, and what would sharing change about how you talk to the AI?
- Would you tell an AI coach things you wouldn't tell your human coach? What kind of things?
- **→ Current position:** The human coach cannot edit or delete sessions the athlete added themselves (stretching, extra work) — they can see them and comment, nothing more. Right boundary, or does a coach need to be able to strike athlete extras that sabotage the plan?
- **→ Current position:** No in-app chat between athlete and human coach in the first version — you already have each other's numbers. Is the app missing the point, or is that correct scope?
- What would make your coach adopt an app like this for their whole roster — and what would make them refuse outright? (Pricing model? Fear of being replaced? Liability?)
- Does your coach have athletes they coach remotely? How does this concept change for a coach who never sees the athlete in person?

## 11. Numbers the Coach Can Trust — training metrics and nutrition (round 2 — new feature)

**What this drives in the app:** We're planning a calculations module that gives the Coach real, deterministic math instead of letting the AI estimate numbers — training zones, weekly load, calorie and fueling targets. The AI is unreliable at arithmetic, so every number the Coach uses will come from tested formulas, and the Coach translates them into natural language (the athlete hears "a genuinely easy week" — never a raw score, consistent with how check-in data already works). The open questions are *which* formulas a real coach actually trusts, and how big the nutrition side needs to be.

- Which numbers does your coach actually work with day to day? TrainingPeaks metrics like TSS/CTL/ATL (training load and fitness/fatigue curves), heart-rate zones, power zones, pace zones — what gets used, and what gets ignored as dashboard noise?
- **→ Current position:** Since your coaching setup runs on TrainingPeaks, we plan to anchor on its metric family (Coggan's training-load model) so the app speaks the same language as the athlete's existing data. Right call, or does your coach quietly disagree with some of those metrics?
- How are your training zones actually set — from a field test (FTP test, threshold run), from race data, from feel? How often are they re-tested, and who decides when?
- Does your coach talk to you in zones and numbers, or does he translate them ("comfortably hard", "conversational pace")? Does that change with athlete experience?
- **→ Current position:** For nutrition, we plan *fueling guidance* — daily calorie/macro targets from published formulas, and race-day fueling (carbs per hour on the bike, sodium, fluids) — but **not** food tracking (no food diary, no barcode scanning, no logging every meal). The reasoning: logging meals is high-friction and most serious athletes stop doing it. Is that the right scope, or does real Ironman coaching need to see what the athlete actually eats?
- What nutrition questions do you actually ask your coach? Everyday diet, race-week carb loading, fueling during long sessions, weight management — where does an Ironman athlete genuinely need help?
- Has fueling ever gone wrong for you in a race or long session? What would a coach have needed to know beforehand to prevent it?
- Are there calculations you'd *never* want automated — numbers where a formula's answer would be worse than a coach's judgment call?

## 12. Questions for the Head Coach (round 3 — real human coach, recruited 2026-07-12)

**Who this is for:** An actual practicing coach — not an athlete. These are the questions the athlete expert explicitly couldn't answer ("jeg er ikke træner"), plus coach-side validation of decisions his answers challenged. Where the athlete gave an answer worth double-checking from the coach's chair, it's marked **→ Athlete said**.

**Coaching workflow and tools**
- Walk me through how you actually plan an athlete's week — tools, rhythm, time spent. Where does time go to logistics instead of coaching?
- Which metrics do you personally work from — TrainingPeaks TSS/CTL/ATL, zones, raw session data, athlete feel reports? Which dashboard numbers are noise you ignore?
- **→ Athlete said** he trains by pace, HR, watts, and feel, and doesn't know what his coach uses internally. Is the load math (TSS/CTL/ATL) genuinely coach-side machinery the athlete never needs to see?
- How do you set and re-test an athlete's zones? The athlete described 10+20 min field tests for bike/run and CSS for swim, with re-tests triggered by "training feels too easy" rather than a calendar. Is that your protocol too?

**Calendar authority (validating round-2 findings)**
- **→ Athlete said** a missed session is simply missed — he'd never move a session into next week, because the week is the planning unit and catch-up belongs in the weekly conversation. As a coach: is "drag a session to next week" a feature any athlete needs, or should we drop it?
- **→ Athlete said** rest-day protection should depend on level: age-groupers need one true rest day per week, elites often train light (swim, easy run) on recovery days, and mobility never counts as load. Does that match how you program rest? Where exactly is the line?
- If you could see how an athlete rearranges their plan over months (always pushing intensity to weekends, always shifting rest days, always adding stretching after hard days) — what would those patterns tell you, and which are worth acting on?
- Are there session-stacking or sequencing patterns dangerous enough (injury risk, not just suboptimal) that an app should intervene immediately rather than wait for the weekly review?
- Who owns strength programming in your coaching — you or the athlete? **→ Athlete said** he owns it and his coach only suggests.

**The AI-assistant layer (Coached Mode)**
- If an AI had read every data point about your athlete — sessions, sleep, subjective body/mind ratings — what would you actually ask it? What would you never trust it on?
- **→ Current position:** The AI drafts the week plan; you edit, add, or override at will, and the AI never touches your sessions without asking — it only *suggests*. Right division of labor, or would you rather author from scratch?
- How would an AI second-guessing your programming land with you — useful analyst or backseat driver? What tone would make the difference?
- **→ Athlete said** in-app chat with the human coach is a must ("everything gathered in one place"). Would you *want* athlete conversations inside a coaching app, or is that a channel you'd rather keep on your own terms?
- **→ Design position (2026-07-13):** we've designed that in-app channel as a *three-party* **Coaching Channel** — you, the athlete, and the AI Coach in one shared thread, where the AI can be asked questions and can proactively offer recommendations. How proactive should the AI be in *your* channel — silent unless asked, or free to flag things? What tone keeps it a useful analyst rather than a backseat driver, and would you want a dial to turn its interjections up or down?
- Should a coach be able to edit or delete sessions the athlete added themselves (extra strength, stretching), or is view-and-comment the right boundary?
- What would make you adopt an app like this for your whole roster — and what would make you refuse outright? (Pricing, fear of replacement, liability, data trust?)
- Do you coach anyone fully remotely? What changes when you never see the athlete in person?

**Numbers and nutrition (coach's chair)**
- Are there calculations you'd never want automated — where a formula's answer is worse than your judgment? (Return-to-training after illness, load progression after injury…) **→ Athlete said** "formulas are good, but a coach often knows more with a feeling."
- What are your actual fueling rules of thumb — grams of carbs per hour by session length/intensity, race-week carb loading, fluid/sodium? Which published guidelines do you trust?
- Do you need to see what an athlete actually eats (food logging), or is it enough to give targets and trust them? **→ Athlete said** both: computed targets as the core, optional logging to verify.

## Notes for the conversation

- These are design questions, not research questions — the goal is concrete answers that change what we build, not validation that the idea is good.
- Questions marked **→ Current position** are places where we've already taken a design stance. The expert can validate or directly challenge these — disagreement is more valuable than agreement.
- If the expert has strong opinions that contradict current design decisions, capture them verbatim — especially on coaching rhythm, athlete psychology, and periodization.
- Section 6 (Weekly Rhythm) contains the most important new questions — we made a significant structural change to the app based on early feedback, and this section is the primary validation test for that decision.
- After the conversation, update `CONTEXT.md` with any new or refined terms, and add a note to `.scratch\mvp\PRD.md` under Further Notes with what changed.
