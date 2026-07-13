const API_BASE = window.location.origin;

export async function callNegotiate(checkIn, messages, apiKey, sessionHistory, sessionContext = null) {
  const res = await fetch(`${API_BASE}/api/negotiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkIn, messages, apiKey, sessionHistory, sessionContext }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'API error'); }
  return (await res.json()).content;
}


export async function callWeeklyPlan(weeklyHistory, apiKey) {
  const res = await fetch(`${API_BASE}/api/weekly/plan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ weeklyHistory, apiKey }),
  });
  if (!res.ok) throw new Error('Plan extraction failed');
  return (await res.json()).sessions;
}

export async function callChat(messages, apiKey, checkIn) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, apiKey, checkIn }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'API error'); }
  return (await res.json()).content;
}

// request: { checkIn, messages, apiKey, weekFeedback, sessionHistory,
//            skippedSessions, unavailableDates, weekActivity }
export async function callWeekly(request) {
  const res = await fetch(`${API_BASE}/api/weekly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'API error'); }
  return (await res.json()).content;
}
