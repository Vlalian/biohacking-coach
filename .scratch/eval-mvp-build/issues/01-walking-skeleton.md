Status: done
Label: wayfinder:task

# 01 — Walking skeleton: a real athlete row on a localized page

> **Done 2026-07-16** — built, reviewed, and merged (PR #4, `build/01-migration-and-seed`). Status flipped 2026-07-17: it had been left at `ready-for-agent` after the merge, and since [slice 02](02-login-with-better-auth.md) is blocked by this ticket, the map's unblocked-when-every-blocker-is-`done` rule made the **entire build read as stalled** to a cold agent. Nothing was wrong but the bookkeeping.
>
> **Two things this slice built are already superseded — do not treat its text as current:**
> - The `athlete` column names it built are corrected by [route 06](../../coach-eval-mvp-route/issues/06-display-name-vs-identity-separation.md) and [07](../../coach-eval-mvp-route/issues/07-schema-names-vs-glossary.md); [slice 02](02-login-with-better-auth.md) applies them.
> - This page renders `display_name`, which becomes `synthetic_label` and goes null for real athletes. After slice 02 a real name resolves through better-auth's `user.name`.
>
> The slice-01 code review is what raised route tickets 06, 07 and 08 — the build finding faults in the planning, which is the point of a walking skeleton.

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
