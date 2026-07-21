Status: done (2026-07-18) — Session Reflection: rate body+mind (RPE 1-5) + comment on completed session; server-authoritative (athlete from auth session, ownership checked, scores validated) writing feedback columns + rated_at; re-rate updates timestamp; rated ring indicator + modal pre-fill; EN+DA. Browser-verified rate/re-rate/refresh both locales; 58 tests. PR pending.
Label: wayfinder:task

# 07 — The athlete rates a session and it sticks

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

Session Reflection: after a session, the athlete rates body and mind on the RPE-based 1–5 scales and optionally leaves a comment. It persists server-side and survives a refresh, a new device, and a browser clear.

The POC's `feedback.js` and its drawer surface are the specification. Feedback lives as columns on `sessions` — `feedback_body`, `feedback_mind`, `feedback_comment`, `rated_at` — not a separate table, per the [signed-off schema](../../coach-eval-mvp-route/issues/05-server-data-model.md).

This is the slice that makes ADR 0006 concrete for the eval's core promise: the athlete's Tuesday rating must be visible to a Head Coach logging in from another machine that evening. The Head Coach cannot see it yet — the Roster arrives in slice 11 — but the rating must already be somewhere that a second person *could* read.

`feedback_comment` is athlete free-text. Under the POC's locality story this never left the device; under ADR 0006 it lives on a server. That shift is disclosed by the consent artifact, which the GDPR ticket owns. Store it plainly and honestly; do not invent an encryption or retention policy here.

## Acceptance criteria

- [ ] The athlete can rate body and mind (1–5) and leave a comment on a completed session
- [ ] The rating persists to the session's feedback columns with `rated_at` set
- [ ] The rating survives a refresh and appears on a different device after signing in
- [ ] A rating can be changed; `rated_at` updates
- [ ] An athlete can only rate their own sessions — a forged request for another athlete's session is refused server-side
- [ ] Reflection strings resolve through i18n in both `da` and `en`
- [ ] Tests cover the write, the re-rate, and the cross-athlete refusal

## Blocked by

`.scratch/eval-mvp-build/issues/04-calendar-renders-real-sessions.md`
