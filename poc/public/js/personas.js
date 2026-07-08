export const PERSONAS = {
  sarah: {
    body: 6, mental: 5, energy: 6, sleep: 7.5, pulse: 68,
    phase: 'Early Base Building', name: 'Sarah Chen', sessionCount: 2, experienceLevel: 'beginner',
    commStyle: `Warm and encouraging. Use plain language — no jargon, no acronyms (not even Z2 or FTP without explaining them). Normalize uncertainty: it is completely fine to feel unsure at this stage. Never make her feel behind or inadequate. Slightly longer responses are fine — she benefits from context. Reassure without being patronising.`,
  },
  thomas: {
    body: 7, mental: 9, energy: 8, sleep: 8.2, pulse: 46,
    phase: 'Taper', name: 'Thomas Eriksen', sessionCount: 47, experienceLevel: 'veteran',
    commStyle: `Terse and data-dense. You can use technical terms freely: FTP, TSS, CTL, ATL, TSB, Z2, threshold, lactate, HRV. No hand-holding, no reassurance, no filler. He knows what he is doing — respect that. Short responses. If he pushes back with data, engage with the data directly.`,
  },
  marcus: {
    body: 6, mental: 6, energy: 5, sleep: 6.1, pulse: 58,
    phase: 'Return to Training', name: 'Marcus Okafor', sessionCount: 8, experienceLevel: 'veteran',
    commStyle: `Honest and structured. Acknowledge his injury history matter-of-factly — do not dwell on it or catastrophise, but never dismiss it either. Give him the logic behind your recommendation so he can trust it. He is cautious for good reason; meet that caution with calm confidence, not reassurance. Medium-length responses.`,
  },
  emma: {
    body: 7, mental: 8, energy: 7, sleep: 7.2, pulse: 51,
    phase: 'Off-season Maintenance', name: 'Emma Larsen', sessionCount: 23, experienceLevel: 'veteran',
    commStyle: `Analytical and reasoning-first. She will ask "why" — anticipate it and answer it inside your recommendation. Explain the training science briefly when relevant. Invite intellectual engagement. You can use some technical language (FTP, aerobic base, periodization) but explain the implications, not just the terms. Medium-length responses.`,
  },
};

export const HISTORY_SCENARIOS = {
  'sleep-intensity': [
    { sessionType: 'intensity', sleep: 5.5, pulse: 62, body: 6, mental: 6, energy: 7, pushedBack: true,  bodyFeedback: 5, mindFeedback: 6, phase: 'Build Phase' },
    { sessionType: 'endurance', sleep: 7.5, pulse: 55, body: 7, mental: 8, energy: 7, pushedBack: false, bodyFeedback: 7, mindFeedback: 8, phase: 'Build Phase' },
    { sessionType: 'intensity', sleep: 5.0, pulse: 64, body: 5, mental: 6, energy: 6, pushedBack: true,  bodyFeedback: 4, mindFeedback: 5, phase: 'Build Phase' },
    { sessionType: 'recovery',  sleep: 8.0, pulse: 52, body: 8, mental: 7, energy: 7, pushedBack: false, bodyFeedback: 8, mindFeedback: 7, phase: 'Build Phase' },
    { sessionType: 'intensity', sleep: 5.8, pulse: 66, body: 6, mental: 5, energy: 5, pushedBack: true,  bodyFeedback: 5, mindFeedback: 5, phase: 'Build Phase' },
    { sessionType: 'endurance', sleep: 7.0, pulse: 57, body: 7, mental: 7, energy: 8, pushedBack: false, bodyFeedback: 8, mindFeedback: 7, phase: 'Build Phase' },
    { sessionType: 'intensity', sleep: 4.5, pulse: 70, body: 4, mental: 5, energy: 5, pushedBack: true,  bodyFeedback: 3, mindFeedback: 4, phase: 'Build Phase' },
  ],
  'pulse-pushback': [
    { sessionType: 'tempo',     sleep: 7.0, pulse: 68, body: 7, mental: 7, energy: 6, pushedBack: true,  bodyFeedback: 6, mindFeedback: 5, phase: 'Peak Phase' },
    { sessionType: 'endurance', sleep: 7.5, pulse: 58, body: 8, mental: 8, energy: 8, pushedBack: false, bodyFeedback: 8, mindFeedback: 8, phase: 'Peak Phase' },
    { sessionType: 'intensity', sleep: 6.5, pulse: 71, body: 6, mental: 6, energy: 6, pushedBack: true,  bodyFeedback: 5, mindFeedback: 6, phase: 'Peak Phase' },
    { sessionType: 'recovery',  sleep: 8.0, pulse: 53, body: 8, mental: 7, energy: 7, pushedBack: false, bodyFeedback: 7, mindFeedback: 8, phase: 'Peak Phase' },
    { sessionType: 'tempo',     sleep: 7.0, pulse: 69, body: 7, mental: 6, energy: 7, pushedBack: true,  bodyFeedback: 5, mindFeedback: 6, phase: 'Peak Phase' },
  ],
  'mind-sleep': [
    { sessionType: 'endurance', sleep: 5.5, pulse: 60, body: 6, mental: 5, energy: 5, pushedBack: false, bodyFeedback: 6, mindFeedback: 3, phase: 'Base Building' },
    { sessionType: 'recovery',  sleep: 8.5, pulse: 52, body: 8, mental: 9, energy: 8, pushedBack: false, bodyFeedback: 9, mindFeedback: 9, phase: 'Base Building' },
    { sessionType: 'intensity', sleep: 6.0, pulse: 58, body: 7, mental: 6, energy: 6, pushedBack: false, bodyFeedback: 5, mindFeedback: 4, phase: 'Base Building' },
    { sessionType: 'endurance', sleep: 7.5, pulse: 55, body: 7, mental: 8, energy: 8, pushedBack: false, bodyFeedback: 7, mindFeedback: 8, phase: 'Base Building' },
    { sessionType: 'tempo',     sleep: 5.0, pulse: 62, body: 6, mental: 5, energy: 5, pushedBack: false, bodyFeedback: 6, mindFeedback: 3, phase: 'Base Building' },
    { sessionType: 'recovery',  sleep: 7.0, pulse: 56, body: 7, mental: 7, energy: 7, pushedBack: false, bodyFeedback: 7, mindFeedback: 7, phase: 'Base Building' },
    { sessionType: 'intensity', sleep: 5.8, pulse: 61, body: 5, mental: 5, energy: 6, pushedBack: false, bodyFeedback: 5, mindFeedback: 3, phase: 'Base Building' },
  ],
  'no-pattern': [
    { sessionType: 'endurance', sleep: 7.5, pulse: 56, body: 7, mental: 8, energy: 7, pushedBack: false, bodyFeedback: 7, mindFeedback: 8, phase: 'Base Building' },
    { sessionType: 'intensity', sleep: 7.0, pulse: 60, body: 7, mental: 7, energy: 7, pushedBack: true,  bodyFeedback: 6, mindFeedback: 7, phase: 'Base Building' },
    { sessionType: 'recovery',  sleep: 8.5, pulse: 52, body: 8, mental: 8, energy: 8, pushedBack: false, bodyFeedback: 8, mindFeedback: 8, phase: 'Base Building' },
    { sessionType: 'endurance', sleep: 5.5, pulse: 58, body: 6, mental: 6, energy: 7, pushedBack: false, bodyFeedback: 7, mindFeedback: 7, phase: 'Base Building' },
    { sessionType: 'tempo',     sleep: 7.0, pulse: 62, body: 8, mental: 7, energy: 6, pushedBack: true,  bodyFeedback: 8, mindFeedback: 6, phase: 'Base Building' },
  ],
};

export const HISTORY_LABELS = {
  'none':            'No session history — Pattern Insight inactive',
  'sleep-intensity': '7 sessions loaded — sleep/intensity pushback pattern active',
  'pulse-pushback':  '5 sessions loaded — elevated pulse pushback pattern active',
  'mind-sleep':      '7 sessions loaded — low mood / poor sleep pattern active',
  'no-pattern':      '5 sessions loaded — no detectable pattern (Coach should not surface one)',
};
