const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const multer = require('multer');
const FitParser = require('fit-file-parser').default;
const { XMLParser } = require('fast-xml-parser');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Pattern detection thresholds.
//
// These are currently global constants — the same values apply to every athlete.
// This is a known limitation: individual baselines vary significantly (a veteran
// sleeping 5.5h may recover fully; a beginner at the same duration is genuinely
// impaired). A future enhancement should move these into the Athlete Profile so
// the Coach can calibrate thresholds per individual once enough history exists.
const PATTERN_THRESHOLDS = {
  poorSleepHours: 6,       // nights below this flag as poor sleep for pattern detection
  lowSleepMoodHours: 6.5,  // threshold for the mood/sleep correlation pattern
  elevatedPulseBpm: 65,    // resting pulse at or above this is flagged as elevated
  lowFeedbackScore: 4,     // body or mind feedback at or below this is "low"
  minOccurrences: 3,       // minimum events needed before a pattern is declared
};

function detectPatterns(sessionHistory) {
  const T = PATTERN_THRESHOLDS;
  if (!sessionHistory || sessionHistory.length < T.minOccurrences) return [];

  const patterns = [];

  const sleepIntensityPushbacks = sessionHistory.filter(s =>
    s.sleep < T.poorSleepHours && s.pushedBack && s.sessionType === 'intensity'
  );
  if (sleepIntensityPushbacks.length >= T.minOccurrences) {
    patterns.push(`pushed back on intensity sessions ${sleepIntensityPushbacks.length} times — always after sleeping under ${T.poorSleepHours} hours`);
  }

  const pulsePushbacks = sessionHistory.filter(s =>
    s.pulse >= T.elevatedPulseBpm && s.pushedBack
  );
  if (pulsePushbacks.length >= T.minOccurrences) {
    patterns.push(`pushed back on sessions ${pulsePushbacks.length} times when resting pulse was elevated above ${T.elevatedPulseBpm} bpm`);
  }

  const lowMindLowSleep = sessionHistory.filter(s =>
    s.sleep < T.lowSleepMoodHours && s.mindFeedback !== undefined && s.mindFeedback <= T.lowFeedbackScore
  );
  if (lowMindLowSleep.length >= T.minOccurrences) {
    patterns.push(`reported low post-session mood ${lowMindLowSleep.length} times on days when sleep was under ${T.lowSleepMoodHours} hours`);
  }

  let postIntensityLowBody = 0;
  for (let i = 1; i < sessionHistory.length; i++) {
    if (sessionHistory[i - 1].sessionType === 'intensity' &&
        sessionHistory[i].bodyFeedback !== undefined &&
        sessionHistory[i].bodyFeedback <= T.lowFeedbackScore) {
      postIntensityLowBody++;
    }
  }
  if (postIntensityLowBody >= T.minOccurrences) {
    patterns.push(`reported low body feedback ${postIntensityLowBody} times in the session immediately after an intensity session`);
  }

  return patterns;
}

// Derives structured coaching intelligence from raw check-in data.
// This is the seam between "what the Coach reasons about" and "how it formats that
// reasoning into a prompt". Tests can verify this function directly — no API call needed.
function buildCoachContext(checkIn, sessionHistory = [], sessionContext = null) {
  const { body, mental, energy, sleep, pulse, phase, personaName, sessionCount, commStyle, experienceLevel, language, equipment } = checkIn;
  const patterns = detectPatterns(sessionHistory);

  const signalConflicts = [];
  if (body <= 4 && energy >= 7) signalConflicts.push('body readiness is low but perceived energy is high');
  if (body >= 7 && energy <= 4) signalConflicts.push('body readiness is high but perceived energy is low');
  if (mental <= 4 && energy >= 7) signalConflicts.push('mental state is low but perceived energy is high');
  if (pulse >= 70 && body >= 7) signalConflicts.push('resting pulse is elevated despite high body readiness');
  if (sleep <= 5 && energy >= 7) signalConflicts.push('sleep was short but energy feels high');

  return {
    body, mental, energy, sleep, pulse, phase, personaName, sessionCount, commStyle, experienceLevel, language, equipment,
    signalConflicts,
    hasConflict: signalConflicts.length > 0,
    patterns,
    sessionContext,
  };
}

function buildEquipmentLines(equipment) {
  const lines = [];
  if (!equipment) return lines;
  if (equipment.bikeType || equipment.bikeModel) lines.push(`Bike: ${[equipment.bikeType, equipment.bikeModel].filter(Boolean).join(' — ')}`);
  if (equipment.powerMeter)    lines.push(`Power meter: ${equipment.powerMeter}`);
  if (equipment.trainingShoes) lines.push(`Training shoes: ${equipment.trainingShoes}`);
  if (equipment.raceShoes)     lines.push(`Race shoes: ${equipment.raceShoes}`);
  if (equipment.wetsuit)       lines.push(`Wetsuit: ${equipment.wetsuit}`);
  if (equipment.gpsWatch)      lines.push(`GPS watch: ${equipment.gpsWatch}`);
  if (equipment.hrMonitor)     lines.push(`Heart rate monitor: ${equipment.hrMonitor}`);
  if (equipment.bikeComputer)  lines.push(`Bike computer: ${equipment.bikeComputer}`);
  if (equipment.notes)         lines.push(`Equipment notes: ${equipment.notes}`);
  return lines;
}

// Serialises a CoachContext into a system prompt string. Pure — no logic here.
function renderPrompt(ctx) {
  const {
    body, mental, energy, sleep, pulse, phase, personaName, sessionCount, commStyle, experienceLevel,
    signalConflicts, hasConflict, patterns, sessionContext, language, equipment,
  } = ctx;

  const equipmentLines = buildEquipmentLines(equipment);

  return `You are Coach in a luxury Ironman training app.${languageDirective(language)} Knowledgeable peer — not prescription machine, not assistant.

POSTURE:
- Lead with evidence. Recommend directly — no hedging.
- End with one genuine question.
- Never defer ("you know your body best").
- Hold position unless athlete gives real reason.
- Weak pushback → acknowledge, hold. Good pushback (new info/context) → adapt, explain why.

${hasConflict ? `UNCERTAINTY REQUIRED:
Conflicts: ${signalConflicts.join('; ')}.
Name conflict before recommending: "Mixed signals — [conflict]. Best read: [recommendation]. [Question]."

` : ''}${equipmentLines.length > 0 ? `EQUIPMENT:
${equipmentLines.map(l => `- ${l}`).join('\n')}
Reference kit when relevant. Never list unprompted.

` : ''}STATE: phase=${phase} sessions=${sessionCount} body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm${personaName ? ` athlete=${personaName}` : ''}

${commStyle ? `COMM STYLE: ${commStyle}\n\n` : ''}${patterns.length > 0 ? `PATTERNS (don't surface directly):
Athlete has: ${patterns.join('; ')}.
Shape recommendations and questions silently. Athlete should feel known, not observed.

` : ''}DATA USE: Scores = intelligence, not script. Never cite numbers/scales.
Low mental/energy → soften load. Low body → reduce demand. Short sleep → recovery. High pulse → lower load.
Conflict → name in plain language ("body ready but energy doesn't match"). Never reference scores.
If athlete asks why ("why this session?" "explain your reasoning") → explain in natural language. Reference state ("you seemed flat this morning"), patterns as coaching intuition. Never cite scores.
${sessionContext ? `
SESSION DISCUSSION:
Athlete tapped a session from Training Plan. Engage directly.
Session: ${sessionContext.type} — ${sessionContext.dayLabel}
Duration: ${sessionContext.duration} · Zone: ${sessionContext.zone}
Note: "${sessionContext.note}"${sessionContext.status === 'skipped' ? '\nPreviously skipped.' : ''}
Walk through rationale in context of ${phase} phase.
` : ''}Keep responses concise. No markdown. No lists.`;
}


function formatWeekFeedback(weekFeedback) {
  if (!weekFeedback || weekFeedback.length === 0) return null;
  const EMOJI = ['😫', '😕', '😐', '🙂', '😄'];
  const emojiFor = val => EMOJI[Math.round((val - 1) * 4 / 9)] || '—';
  return weekFeedback.map(entry => {
    const date    = new Date(entry.dateKey);
    const dayName = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const type    = entry.sessionType || 'Training';
    const body    = emojiFor(entry.body);
    const mind    = emojiFor(entry.mind);
    const comment = entry.comment ? ` · "${entry.comment}"` : '';
    return `- ${dayName} · ${type} · Body ${body} (${entry.body}/10) · Mind ${mind} (${entry.mind}/10)${comment}`;
  }).join('\n');
}

function buildWeeklyContext(checkIn, weekFeedback = [], sessionHistory = [], skippedSessions = [], unavailableDates = []) {
  const { body, mental, energy, sleep, pulse, phase, personaName, commStyle, experienceLevel, sessionCount, language, weeklySessionDay, fixedConstraints, equipment, weeklySessionNumber, raceTarget } = checkIn;
  const patterns        = detectPatterns(sessionHistory);
  const feedbackSummary = formatWeekFeedback(weekFeedback);
  const today           = new Date().toISOString().slice(0, 10);
  return { body, mental, energy, sleep, pulse, phase, personaName, commStyle, experienceLevel, sessionCount, patterns, feedbackSummary, skippedSessions, unavailableDates, today, language, weeklySessionDay, fixedConstraints, equipment, weeklySessionNumber, raceTarget };
}

function renderWeeklyPrompt(ctx) {
  const { body, mental, energy, sleep, pulse, phase, personaName, commStyle, experienceLevel, sessionCount, patterns, feedbackSummary, skippedSessions, unavailableDates, today, language, weeklySessionDay, fixedConstraints, equipment, weeklySessionNumber, raceTarget } = ctx;
  const equipmentLines = buildEquipmentLines(equipment);
  const hasEquipment   = equipmentLines.length > 0;

  return `You are Coach in a luxury Ironman training app.${languageDirective(language)} Weekly Session — primary structured conversation, once per week.

POSTURE: Confident, evidence-led, direct. Hold position unless athlete gives real reason. No markdown, lists, platitudes.

${weeklySessionNumber === 1 ? `ARC — SESSION 1:

P1 WELCOME:
First meeting. Know athlete only from onboarding (name, race, experience, background). No history, feedback, patterns. Don't fake familiarity.
Don't ask "how did the week feel" — no week yet. Welcome briefly, ask ONE physical state question: "Where are you right now physically — in rhythm or starting from scratch?" Wait.

P2 INTAKE:
Acknowledge what they say. Factor in injuries, gaps, fitness level. Brief.

P3 FIRST WEEK:
Propose week. Explain reasoning more than usual — first exposure to coaching style. Name what you're building toward, not just sessions. "This is my starting point — does it fit?" Adjust. Close → see FIRST SESSION ORIENTATION.${raceTarget ? `\nRACE: ${raceTarget} — name once in P3 close (e.g. "This is your start toward [race]"). Not as greeting.` : ''}` : weeklySessionNumber === 2 ? `ARC — SESSION 2:

P1 CHECK-IN:
One week history. Concrete debrief — not broad self-assessment. Ask: sessions, what felt hard, body response. 1-2 questions.

P2 REVIEW:
Acknowledge. Cross-ref feedback (may be sparse). Still building athlete picture — say so. Reference session 1 and onboarding. Name plan vs reality.

P3 PLANNING:
Build week 2 from week 1 learnings. Name connections: "legs heavy Thu → protect recovery earlier." Present sessions, ask if it works, adjust. Close with send-off, open door.` : weeklySessionNumber === 3 ? `ARC — SESSION 3:

P1 OPENING:
Two weeks history — early relationship. Reference something specific from last session/feedback. Don't fake pattern knowledge. Ask: "Last week you mentioned X — how did that play out?"

P2 REVIEW:
Standard review, limited history caveat. Declare uncertainty. Two consistent weeks → "starting to notice a pattern."

P3 PLANNING:
Standard. Factor early patterns silently — surface only if 2+ weeks consistent.` : `ARC — SESSION 4+:

P1 REFLECTIVE PROMPT:
Ask 1-2 questions before giving your read. Pick most relevant: physical state, energy/sleep, mental load, perceived progress, health flags. Wait.

P2 WEEK REVIEW:
Acknowledge. Synthesise self-assessment + feedback + signals. Name patterns, strong sessions, warnings. Flag gaps between athlete self-read and data.

P3 PLANNING:
Lead with plan. Present sessions, load, reasoning. "Does that work, or anything needs moving?" Adjust. Close with send-off + open door.`}

TODAY: ${today}
${(() => {
  const dayOfWeek = new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  const prefDay   = weeklySessionDay && weeklySessionDay !== 'Flexible' ? weeklySessionDay : null;
  const onPrefDay = prefDay && dayOfWeek === prefDay;
  return prefDay && !onPrefDay
    ? `PLANNING DAY: Preferred ${prefDay}, today ${dayOfWeek}. Ask: "Plan rest of this week or from next ${prefDay}?"\n`
    : '';
})()}${fixedConstraints && fixedConstraints.length > 0 ? `NO TRAINING ON: ${fixedConstraints.join(', ')}\n\n` : ''}${hasEquipment ? `EQUIPMENT:\n${equipmentLines.join('\n')}\n\n` : ''}STATE: phase=${phase} sessions=${sessionCount} body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm xp=${experienceLevel || 'intermediate'}${personaName ? ` athlete=${personaName}` : ''}

${feedbackSummary ? `LAST WEEK FEEDBACK:\n${feedbackSummary}\n\n` : 'No feedback this week — use check-in signals and self-assessment.\n\n'}${commStyle ? `COMM STYLE: ${commStyle}\n\n` : ''}${patterns.length > 0 ? `PATTERNS: ${patterns.join('; ')}.
Strong (multi-week) → surface ONE in P2: "I've noticed X, pretty common at this stage. Does that match?" Not data/criticism. Max one per session.
Weak → shape plan silently.\n\n` : ''}${skippedSessions && skippedSessions.length > 0 ? `SKIPPED: ${skippedSessions.map(s => `${s.date} ${s.sessionType}`).join(', ')} — mention naturally in review, no justification needed.\n\n` : ''}${unavailableDates && unavailableDates.length > 0 ? `UNAVAILABLE: ${unavailableDates.join(', ')} — no sessions, don't mention unless athlete raises it.\n\n` : ''}CONSTRAINT SIGNALS (append on last line, stripped by app):
Specific date blocked → [UNAVAILABLE:YYYY-MM-DD]
Ambiguous ("can't do Tuesdays") → ask "just this week or every week?" first
Every [day] → [FIXED_CONSTRAINT_ADD:DayName]
Day unblocked → [FIXED_CONSTRAINT_REMOVE:DayName]
No justification needed.

DATA USE: Scores = coaching intelligence, never cite directly.
Low body/energy/mental → soften load. Poor sleep → recovery. High pulse → protect easy days. Strong feedback → validate. Mixed → name inconsistency.
${weeklySessionNumber === 1 ? `
FIRST SESSION ORIENTATION:
After send-off, weave 3-4 sentences — coach orienting athlete, not product tour:
1. Training Plan tab — tap sessions to log body/mind; that's how I learn what works for you
2. Equipment tab — add gear for more specific advice
3. Glossary — unfamiliar terms, it's there
4. Coach Chat — "question mid-week? Find me in Coach Chat."
` : ''}${weeklySessionNumber >= 2 && weeklySessionNumber <= 3 && !hasEquipment ? `
EQUIPMENT NUDGE: One sentence in planning — don't know what they train on; Equipment tab helps you be specific. Once only.
` : ''}`;
}

function buildChatPrompt(checkIn) {
  const { body, mental, energy, sleep, pulse, phase, commStyle, experienceLevel, sessionCount, language, fixedConstraints, equipment } = checkIn;
  const today = new Date().toISOString().slice(0, 10);

  const equipmentLines = buildEquipmentLines(equipment);

  return `You are Coach in a luxury Ironman training app.${languageDirective(language)} Coach Chat — on-demand open conversation. Training, nutrition, equipment, race logistics, mindset, injury, anything.

POSTURE: Confident, evidence-led, direct. Real conversation — respond to what they're asking. One follow-up if needed. Concise. No markdown, no lists unless athlete asks for breakdown.

TODAY: ${today}

CONTEXT (use silently — never cite scores/numbers):
phase=${phase} xp=${experienceLevel || 'intermediate'} sessions=${sessionCount} body=${body}/10 mental=${mental}/10 energy=${energy}/10 sleep=${sleep}h pulse=${pulse}bpm${fixedConstraints && fixedConstraints.length > 0 ? ` no-train=${fixedConstraints.join(', ')}` : ''}${equipmentLines.length > 0 ? `\n\nEQUIPMENT:\n${equipmentLines.join('\n')}` : ''}

CONSTRAINT SIGNALS (append on last line, stripped by app):
Specific date blocked → [UNAVAILABLE:YYYY-MM-DD]
Ambiguous ("can't do Tuesdays") → ask "just this week or every week?" first
Every [day] → [FIXED_CONSTRAINT_ADD:DayName]
Day unblocked → [FIXED_CONSTRAINT_REMOVE:DayName]
No justification needed.

${commStyle ? `COMM STYLE: ${commStyle}\n\n` : ''}PRIVACY: Never use athlete's name. Second person only. No PII reproduction.

// TODO (MVP): Add Anthropic zero-data-retention header once DPA is in place.
// Until then, the privacy notice shown to the athlete explicitly flags AI processing.`;
}


const TRAINING_PHASES = ['Early Base Building', 'Base Building', 'Build Phase', 'Peak Phase', 'Taper', 'Recovery', 'Return to Training', 'Off-season Maintenance'];

const SPORTS_TERMS = 'RPE, FTP, CSS, Zone 1-5, Ironman, 70.3, brick, tempo, threshold, VO2max, CTL, ATL, TSB, HRV, watts, TSS';

function languageDirective(language) {
  if (!language || language === 'English' || language === 'en') return '';
  if (language === 'Dansk' || language === 'da') {
    return `\nLANGUAGE: Respond in Danish. The following terms always stay in English: ${SPORTS_TERMS}.\n`;
  }
  return '';
}

// ── Routes ──────────────────────────────────────────────────────────────────

// Session Negotiation: check-in → recommendation → pushback loop
app.post('/api/negotiate', async (req, res) => {
  try {
    const { checkIn, messages, apiKey, sessionHistory, sessionContext } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });

    const client = new Anthropic({ apiKey });
    const ctx = buildCoachContext(checkIn, sessionHistory || [], sessionContext || null);
    const conversationMessages = messages && messages.length > 0
      ? messages
      : [{ role: 'user', content: 'Give me my session recommendation based on my current state.' }];

    const response = await client.messages.create({
      model: process.env.COACH_MODEL || 'claude-sonnet-4-6',
      max_tokens: 800,
      system: renderPrompt(ctx),
      messages: conversationMessages,
    });

    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error('Negotiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Weekly Session: Reflective Prompt → week review → next week planning
app.post('/api/weekly', async (req, res) => {
  try {
    const { checkIn, messages, apiKey, weekFeedback, sessionHistory, skippedSessions, unavailableDates } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });

    const client = new Anthropic({ apiKey });
    const ctx    = buildWeeklyContext(checkIn, weekFeedback || [], sessionHistory || [], skippedSessions || [], unavailableDates || []);
    const conversationMessages = messages && messages.length > 0
      ? messages
      : [{ role: 'user', content: "Let's do our weekly session." }];

    const response = await client.messages.create({
      model:      process.env.COACH_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1400,
      system:     renderWeeklyPrompt(ctx),
      messages:   conversationMessages,
    });

    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error('Weekly error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Extracts a structured 7-day plan from the completed Weekly Session conversation
app.post('/api/weekly/plan', async (req, res) => {
  try {
    const { weeklyHistory, apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });

    const conversationText = weeklyHistory
      .map(m => `${m.role === 'assistant' ? 'Coach' : 'Athlete'}: ${m.content}`)
      .join('\n');

    const prompt = `Extract the week training plan agreed in this coaching conversation.

CONVERSATION:
${conversationText}

Return ONLY a valid JSON array of exactly 7 objects, one per day Monday through Sunday, in order:
[
  { "dayOfWeek": "Monday", "type": "Endurance"|"Intensity"|"Tempo"|"Recovery"|"Rest", "duration": "e.g. 60 min" or null, "zone": "e.g. Z2" or null, "note": "one coaching line" or null },
  ...
]

Rules:
- If a day is a rest day or not mentioned, use type "Rest" with null for duration, zone, and note.
- Only use these exact type values: Endurance, Intensity, Tempo, Recovery, Rest.
- Return JSON only — no preamble, no code fences.`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      process.env.COACH_MODEL || 'claude-sonnet-4-6',
      max_tokens: 600,
      system:     'You are a data extractor. Return only valid JSON arrays. No preamble, no code fences.',
      messages:   [{ role: 'user', content: prompt }],
    });

    let sessions;
    try {
      const raw = response.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      sessions = JSON.parse(raw);
    } catch {
      return res.status(422).json({ error: 'Could not parse plan' });
    }

    res.json({ sessions });
  } catch (err) {
    console.error('Weekly plan extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Coach Chat: on-demand open conversation on any topic
app.post('/api/chat', async (req, res) => {
  try {
    const { checkIn, messages, apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'Messages required' });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      process.env.COACH_MODEL || 'claude-sonnet-4-6',
      max_tokens: 800,
      system:     buildChatPrompt(checkIn),
      messages,
    });

    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Garmin Upload ─────────────────────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 10 * 1024 * 1024 } });

const SPORT_MAP = {
  running: 'Endurance', cycling: 'Endurance', swimming: 'Endurance',
  triathlon: 'Endurance', open_water: 'Endurance', rowing: 'Endurance',
  strength_training: 'Strength', training: 'Strength',
};

function inferSessionType(sport = '') {
  return SPORT_MAP[sport.toLowerCase()] || 'Endurance';
}

function parseFit(buffer) {
  return new Promise((resolve) => {
    const parser = new FitParser({ force: true, mode: 'list' });
    parser.parse(buffer, (error, data) => {
      if (error || !data) return resolve([]);
      const sessions = (data.activity?.sessions || []);
      resolve(sessions.map(s => ({
        date:        s.start_time ? new Date(s.start_time).toISOString().slice(0, 10) : null,
        sessionType: inferSessionType(s.sport || ''),
        duration:    s.total_elapsed_time ? Math.round(s.total_elapsed_time / 60) : null,
        body:        null,
        mind:        null,
        note:        `Imported from Garmin${s.sport ? ' · ' + s.sport : ''}`,
      })).filter(s => s.date));
    });
  });
}

function parseGpx(buffer) {
  const xml = buffer.toString('utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let gpx;
  try { gpx = parser.parse(xml); } catch { return []; }
  const tracks = gpx?.gpx?.trk;
  const list   = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];
  return list.map(trk => {
    const segments = [].concat(trk.trkseg || []);
    const points   = segments.flatMap(seg => [].concat(seg.trkpt || []));
    const times    = points.map(p => p.time).filter(Boolean);
    const date     = times.length > 0 ? new Date(times[0]).toISOString().slice(0, 10) : null;
    const firstTs  = times.length > 0 ? new Date(times[0]).getTime() : 0;
    const lastTs   = times.length > 0 ? new Date(times[times.length - 1]).getTime() : 0;
    const duration = firstTs && lastTs ? Math.round((lastTs - firstTs) / 60000) : null;
    const typeName = trk.type || trk.name || '';
    return { date, sessionType: inferSessionType(typeName), duration, body: null, mind: null, note: `Imported from GPX${typeName ? ' · ' + typeName : ''}` };
  }).filter(s => s.date);
}

const SIX_MONTHS_AGO = () => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); };

app.post('/api/garmin/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const cutoff = SIX_MONTHS_AGO();
    const sessions = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const parsed = ext === '.fit' ? await parseFit(file.buffer) : ext === '.gpx' ? parseGpx(file.buffer) : [];
      sessions.push(...parsed.filter(s => s.date >= cutoff));
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ sessions });
  } catch (err) {
    console.error('Garmin upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Coach POC running at http://localhost:${PORT}`);
    console.log('Enter your Anthropic API key in the UI');
  });
}
module.exports = { buildWeeklyContext, renderWeeklyPrompt };
