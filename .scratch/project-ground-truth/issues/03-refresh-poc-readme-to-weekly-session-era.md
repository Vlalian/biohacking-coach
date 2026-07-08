# Refresh the POC README to the Weekly Session era

Label: wayfinder:task
Status: ready-for-agent
Blocked by: 01
Map: ../MAP.md

## Question

poc/README.md is titled "Session Negotiation POC" and claims to demonstrate features removed on 2026-06-26 (Pushback Rationale log, `getRecommendation` flow, conversational Session Reflection — see `.scratch/deleted-session-negotiation.md`). Per CONTEXT.md, the Weekly Session replaced daily Session Negotiation as the primary loop, and Session Reflection is now two RPE ratings, not a conversation.

Rewrite the README against the *actual current code* (server.js, public/js/): title, "What it demonstrates", persona table (verify it still matches use-me), and "Next increments". Read the source, don't trust the old list. Resolution records what the POC currently demonstrates — that list is itself useful ground truth for the drift-audit fog on the map.
