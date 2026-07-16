Label: wayfinder:grilling
Status: ready-for-human

# Design the server data model

## Question

With the feature scope ([02](02-coached-mode-mvp-scope.md)), the architecture ([03](03-client-server-architecture.md)), and the DB ([04](04-hosting-db-auth-stack.md)) decided, design the shared schema (via `/domain-modeling`):

- **Accounts + roles** — athlete and Head Coach; how a single person could be both (Mads is the athlete; the coach is the coach).
- **Migration of the on-device data** — every `bh_*` key becomes server state: the entity store (`bh_sessions`), per-session streams (`bh_stream_*`), feedback, week plans, Information View layout, onboarding profile. What moves, what stays local (per the 03 hybrid line, if chosen).
- **Coaching Link** — the athlete↔coach relationship record; single-use invite vs. seeded link (per 02).
- **Link Visibility** — per-athlete, per-section sharing flags (training data default-on, AI-chat transcripts opt-in, calendar always visible) expressed relationally and enforced server-side.

Output: the schema + migration plan the build implements. Keep it a shape a real roster extends, not a two-row special case.

## Blocked by

02, 03, 04 — needs the feature scope, the architecture fork, and the DB choice.
