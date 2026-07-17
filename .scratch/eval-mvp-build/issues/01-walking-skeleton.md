Status: ready-for-agent
Label: wayfinder:task

# 01 — Walking skeleton: a real athlete row on a localized page

## Parent

`.scratch/eval-mvp-build/PRD.md`

## What to build

The thinnest end-to-end path through the whole stack, running locally: a Next.js + React app that reads one `athlete` row out of Neon Postgres via Drizzle and renders its `display_name` on a page — in Danish or English.

This proves [ADR 0005](../../../docs/adr/0005-nextjs-better-auth-neon-stack.md) works before anything is built on it. Everything after this slice is filling in.

Bring only the `athlete` table (per the [signed-off schema](../../coach-eval-mvp-route/issues/05-server-data-model.md)) and the beginnings of the seed script — one athlete row is enough. `user_id` stays nullable and unset here; login arrives in slice 02.

**Localization is not optional in this slice.** The POC is bilingual today and the rebuild must not regress it. Stand up the i18n mechanism now, so the first page ever rendered resolves its strings through it and no component is written English-only. Only this page's strings are ported — later slices bring their own. Technical sports terms (RPE, FTP, CSS, Zone 2, Ironman) stay English in every language, per the Athlete Language effort.

Vitest carries over from the POC as the test runner. Note the POC pins vitest 2, which has known dev-server advisories; start on a current version rather than inheriting them.

## Acceptance criteria

- [ ] A Next.js app builds and runs locally
- [ ] Drizzle connects to a Neon Postgres instance in the **Frankfurt** region and the `athlete` table exists via a Drizzle migration
- [ ] A seed script inserts one athlete row (Mads, no `user_id`)
- [ ] A page renders that athlete's `display_name`, read server-side from Postgres — not hardcoded, not fetched from localStorage
- [ ] The page's strings resolve through the i18n mechanism; switching locale to `da` renders Danish
- [ ] Technical sports terms remain English under both locales
- [ ] Tests cover the seam that reads the athlete, and pass under `npm test`
- [ ] No `bh_*` localStorage key is read or written anywhere in the new app

## Blocked by

None — can start immediately.

## Notes

**HITL:** this slice needs a Neon signup. [Route ticket 04](../../coach-eval-mvp-route/issues/04-hosting-db-auth-stack.md) verified Frankfurt and the DPA, and flagged one signup-time check: confirm the free plan actually offers the Frankfurt region.
