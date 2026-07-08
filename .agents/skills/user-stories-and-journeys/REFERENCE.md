# User Stories & Journeys — Reference

## Framework Overview

```
CONCEPT STORY    → What the product IS and its value proposition
      ↓
ORIGIN STORY     → How users DISCOVER and CONVERT (marketing / onboarding)
      ↓
USAGE STORY      → How users EXPERIENCE value (product UX flows)
      ↓
USER STORY MAP   → Usage story organised into a development backlog (Patton)
      ↓
USER STORIES     → Smallest buildable units of value (As a / I want / So that)
      ↓
JOURNEY MAP      → Full emotional + touchpoint landscape visualised
```

---

## Narrative Arc — Detailed

Based on Donna Lichaw, *The User's Journey* (Rosenfeld Media, 2016).

Every story type uses the same seven plot points plotted on a timeline (X = time, Y = excitement/action):

| Plot Point | Purpose | Signs it's missing |
|---|---|---|
| **Exposition** | Sets the stage — user, world, big goal | Feels like it starts in the middle |
| **Inciting Incident** | The problem that disrupts the status quo | Story feels purposeless; no hook |
| **Rising Action** | Steps toward resolution; conflict escalates | Flat, boring; no tension builds |
| **Crisis** | Maximum conflict; point of no return | Story resolves too easily; forgettable |
| **Climax** | High point; core value experienced; the BOOM | No reward for attention; why stay? |
| **Falling Action** | Tension releases; quick closure | Leaves user suspended; unsatisfying |
| **End** | Goal met; character changed; next story seeded | Feels abrupt or unresolved |

**Anticlimactic stories** lack a crisis and/or climax — they're flat lines. The brain needs height to engage.

**Cliffhanger** = story that ends before (or at) the crisis without resolving it. Treat every funnel drop-off as a cliffhanger to diagnose and fix.

---

## Concept Story — Full Question Set

```
Exposition:
  - Who is the target user / persona?
  - What is good in their world right now (as it relates to the product)?
  - What is their big, overarching goal?

Inciting Incident:
  - What is their specific problem or pain point?
  - Is this a problem they know they have, or one you need to show them?

Rising Action:
  - What is the product name?
  - What market category does it belong to?

Crisis:
  - What does the competition look like (direct + indirect)?
  - What mental hurdles or fears might prevent adoption?
  - What switching costs exist?

Climax / Resolution:
  - What resolves the user's problem AND overcomes the crisis?
  - What is the primary value proposition?
  - What makes it demonstrably better than alternatives?

Falling Action:
  - What should users THINK or ENVISION after hearing about the product?
  - Is this reaction plausible? If not, is the audience wrong or the concept?

End:
  - How does the user see themselves meeting their goal?
  - How does the business mission align with and serve this user goal?
  - What metric signals success?
```

---

## Origin Story — Full Question Set

```
Exposition + Inciting Incident: (same answers as Concept Story)

Rising Action — Acquisition channels:
  - How might users first hear about / find the product?
    (word-of-mouth, organic search, social media, paid ads, email, press, App Store)
  - How does each channel relate to their pain point?

Crisis — Resistance:
  - What might get in their way BEFORE they take action?
  - Competitor products / alternatives they already use?
  - General resistance to trying something new?
  - Safety, security, cost fears?
  - Confusing copy or unclear value on the landing experience?

Climax — The landing experience:
  - Where do you want users to arrive? (home page, landing page, App Store page, etc.)
  - What parts of the story do you show them to make them care IMMEDIATELY?
  - How do you communicate value in the first few seconds?

Falling Action — The action:
  - What is the ONE primary action you want them to take?
  - What secondary actions exist (for users not ready for the primary)?
  - Common falling actions: sign up, try demo, watch video, call, learn more

End:
  - User has converted (first-time user). What did they achieve?
  - What business acquisition metric is served?
  - How will you measure this end state?
```

---

## Usage Story — Full Question Set

```
Scope first:
  - Epic (lifecycle, weeks–years)?
  - Serial (recurring sessions)?
  - Micro-story (single task / flow)?

Exposition:
  - Who is the user in this context?
  - What are their goals for this session or interaction?
  - What is their emotional state at entry?

Inciting Incident:
  - What triggers this specific journey?
  - (CTA, push notification, email, recurring habit, external event)

Rising Action:
  - What is the first action the user takes?
  - Step by step: what happens next, and next?
  - Where does complexity or choice increase?

Crisis:
  - What friction, confusion, or obstacles might they hit?
  - (Paywall, complexity, slow performance, unclear next step, boredom, distraction)
  - Emotional barriers: doubt, frustration, distraction?

Climax / Resolution:
  - What is the HIGH POINT of value in this flow?
  - When does the user feel "aha!" or "this is worth it"?
  - What makes all the prior effort worthwhile?

Falling Action:
  - How do you provide quick closure after the climax?
  - Confirmation, summary, feedback, celebration — what wraps the episode?

End:
  - Where does the user end up (logistically and emotionally)?
  - What did they accomplish?
  - What seeds the NEXT story / session? (serial hook = retention driver)
```

---

## User Story Map (Jeff Patton)

### Structure
```
[Activity 1]    [Activity 2]    [Activity 3]    ← Backbone (epics / user goals)
  Task 1a         Task 2a         Task 3a       ← Step-by-step user tasks
  Task 1b         Task 2b         Task 3b
─────────────────────────────────────────────── ← MVP slice line
  Task 1c         Task 2c                       ← Release 2
  Task 1d                                       ← Release 3
```

### Building the Map
1. Define the user and their overarching goal
2. Silent brainstorm — write every user step on separate post-its
3. Arrange post-its chronologically (left to right)
4. Group tasks into Activities (3–5 words each) — these form the backbone
5. Under each Activity, write User Story stubs (1 per post-it, start with a verb)
6. Prioritize vertically: Must / Should / Could / Won't (MoSCoW)
7. Draw horizontal release lines — everything above Line 1 = MVP

### MVP Sanity Check
Walk along the MVP slice and ask:
- Does this produce a cohesive, standalone product?
- Can users complete enough of their goal to get real value?
- Is every story in the MVP truly required, or is it "nice to have"?

---

## Agile User Story — Formats

### Standard Format
```
As a [type of user],
I want [to perform some action],
so that [I achieve some benefit / value].
```

### Job Story Format (JTBD variant)
```
When [situation / context],
I want to [motivation / goal],
so I can [expected outcome].
```
Use when the situation/trigger matters more than the persona.

### Acceptance Criteria — Given/When/Then
```
Given [the user is in some context],
when [they perform some action],
then [an observable outcome occurs].
```

### Acceptance Criteria — Rule-oriented
Simple bullet list of conditions the feature must meet to be considered complete.
Keep to 1–5 criteria per story; 1–3 is ideal.

---

## Journey Map — Full Row Definitions

| Row | What to capture |
|---|---|
| **Phase** | High-level stage name (Awareness / Discovery / Onboarding / Core Use / Advocacy) |
| **Actions** | Concrete steps the user takes |
| **Thoughts** | What they're thinking / saying to themselves |
| **Emotions** | How they feel — use a 0–10 scale or emoji curve |
| **Touchpoints** | Channel or surface where they interact (app, email, website, support, etc.) |
| **Pain Points** | What frustrates, confuses, or blocks them |
| **Opportunities** | Design/product improvements implied by the pain points |

### Standard Phases
- **Awareness** — User first hears about the product
- **Consideration** — User evaluates whether to try it
- **Onboarding / First Use** — User converts and uses for the first time
- **Ongoing Use** — Recurring sessions; habit formation
- **Advocacy** — User recommends to others; becomes a superfan

---

## Map Types — When to Use Which

| Map | Focus | Use when |
|---|---|---|
| **Concept / Origin / Usage Story** (Lichaw) | Narrative engagement | Defining/validating product concept, building alignment, pitching |
| **Customer Journey Map** | Front-stage user experience | Understanding and improving what users see and feel |
| **Service Blueprint** | Front-stage + back-stage operations | Mapping how the org delivers the experience; service design |
| **Experience Map** | Human behaviour, no product tied | Exploring a broad problem space before defining a solution |
| **User Story Map** (Patton) | Agile backlog as journey | Prioritising development work, defining MVP, sprint planning |

---

## Jobs to Be Done (JTBD)

- Users "hire" a product to do a job (achieve an outcome in a context)
- Focus on the job (desired outcome), not the user's role or the feature
- Solution-agnostic: JTBD helps you avoid premature feature lock-in

**Pairing with personas**: Persona = WHO. JTBD = WHAT they're trying to achieve and WHY.

**Discovery interview question**: "Tell me about the last time you [did the thing the product helps with]. Walk me through exactly what happened."

---

## Finding Stories — Techniques

| Technique | How |
|---|---|
| **Listen** | 1:1 customer interviews. Ask "what if this worked like magic?" |
| **5 Whys** | Ask "why?" recursively until the real goal (not the stated want) surfaces |
| **Smile Test** | During prototype testing, watch for genuine smiles at the climax. No smile = flat story or misplaced climax |
| **Measure** | Funnel analytics reveal cliffhangers. Diagnose drop-off as story failure, not just UX failure |
| **What If?** | Brainstorm magical versions. "It would just know what I want." Map these as hypotheses to test |
| **Borrow** | Reverse-engineer successful products' concept/origin/usage stories for inspiration and proof-of-concept |

---

## Rules of Thumb (Lichaw's Chapter 8)

1. **Stories are character-driven** — base every character on real people and real data; validate hypothetical characters
2. **Characters are goal-driven** — always ask "what does this person WANT?"
3. **Goals can change** — ask "why?" recursively; the real goal is often deeper than the stated one
4. **Goals are measurable** — define qualitative (interviews, observation) AND quantitative (analytics, conversions) success criteria
5. **Conflict is key** — no conflict = no story = no engagement; design around obstacles, don't ignore them
6. **The Formula**: A (forward momentum) − B (opposing forces) = C (climax). Strengthen both A and B to heighten C
7. **Choose Your Own Adventure** — plan for branching paths; map the happy path first, then the alternatives
8. **Make Things Go BOOM** — every story needs an engineered climax moment; if you can't identify it, the story isn't done

---

## Sources

- Donna Lichaw, *The User's Journey: Storymapping Products That People Love* (Rosenfeld Media, 2016)
- Jeff Patton, *User Story Mapping: Discover the Whole Story, Build the Right Product* (O'Reilly, 2014)
- Nielsen Norman Group — [Journey Mapping 101](https://www.nngroup.com/articles/journey-mapping-101/)
- Nielsen Norman Group — [User Story Mapping](https://www.nngroup.com/articles/user-story-mapping/)
- Atlassian — [User Stories with Examples and a Template](https://www.atlassian.com/agile/project-management/user-stories)
- Google Design Sprint Kit — [User Journey Mapping](https://designsprintkit.withgoogle.com/methodology/phase1-understand/user-journey-mapping)
