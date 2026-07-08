# Session Negotiation POC

Working prototype of the Biohacking Coach App's core interaction loop.

## Run

```bash
npm install
node server.js
```

Open http://localhost:3000. Enter your Anthropic API key in the UI.

## What it demonstrates

- **Peer Authority** — Coach states evidence, gives direct recommendation, invites response
- **Declared Uncertainty** — fires when Check-in signals conflict (e.g. body=3, energy=9)
- **Reflective Prompt** — Coach asks athlete to reason first when sessionCount >= 5
- **Pushback handling** — Coach holds position or adapts based on quality of athlete's reason
- **Tone Adaptation** — load a persona to see vocabulary and warmth shift (Sarah vs Thomas)
- **Pushback Rationale log** — every pushback captured below the conversation

## Test personas (from use-me skill)

| Persona | Sessions | Phase | Tests |
|---------|----------|-------|-------|
| Sarah | 2 | Early Base | Warm tone, direct mode, plain language |
| Thomas | 47 | Taper | Terse/technical tone, Reflective Prompt always fires |
| Marcus | 8 | Return to Training | Injury-aware framing, Reflective Prompt eligible |
| Emma | 23 | Off-season | Reasoning-first tone, Reflective Prompt active |

## TDD increments completed

1. Tracer bullet — full Check-in → recommendation → pushback loop
2. Reflective Prompt — withholds recommendation for athletes with 5+ sessions
3. Tone Adaptation — Communication Style per persona injected into system prompt

## Next increments

- Pattern Insight — Coach surfaces cross-variable pattern from simulated history
- Trajectory Projection — aspirational framing for beginners, personal progression for veterans
