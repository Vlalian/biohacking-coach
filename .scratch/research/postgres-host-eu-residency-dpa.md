# Postgres Hosting — EU Data Residency & DPA Verification

Research notes, 2026-07-16. Grounded in primary sources only (official docs, legal pages, the DPA documents themselves — no blog posts); every claim cites the page it comes from, fetched live on this date. Written for a non-lawyer: jargon is explained the first time it appears. This verifies the three selection criteria from ticket 04 (EU region, DPA — ideally auto-incorporated, clear data-location + subprocessor story) for the Postgres candidates, plus a brief pass over the app-hosting candidates.

**Jargon, once:** Under GDPR, the app (Mads) is the **data Controller** — the party deciding why and how athletes' personal data is processed. Any company that stores or processes that data on the app's behalf (the database host, the app host) is a **Processor**, and GDPR Article 28 requires a written contract between Controller and Processor — the **DPA** (Data Processing Agreement/Addendum). A **subprocessor** is a company the Processor itself uses (e.g. Neon runs on AWS — AWS is Neon's subprocessor); the DPA must let you see and object to that list. **SCCs** (Standard Contractual Clauses) are the European Commission's pre-approved contract text (Decision 2021/914) that makes it legal to transfer EU personal data to a country without an adequacy ruling, chiefly the US. "Auto-incorporated" means the DPA is part of the standard terms you accept at signup — no sales contact, no signature ceremony.

---

## The short version

| Criterion | Neon | Supabase |
|---|---|---|
| EU region (data at rest in EU) | **Yes** — Frankfurt (`aws-eu-central-1`); London is UK, not EU | **Yes** — Ireland, Paris, Frankfurt, Stockholm (London/Zurich are non-EU) |
| Region on the free plan | No documented plan restriction found (not explicitly guaranteed either) | No documented plan restriction found |
| DPA | **Yes, auto-incorporated** — via the Databricks MCSA, which incorporates the Databricks DPA (with SCCs) by reference | **Yes, but signed** — self-serve from the dashboard, executed via PandaDoc; not automatic |
| Subprocessor list | Public page, neon.com/subprocessors (updated 2026-04-16) | Schedule 3 of the DPA document |
| pgvector on free tier | **Yes** — "every Neon plan" | **Yes** — no plan restriction documented |

**Verdict: Neon passes all three criteria** — and, post-Databricks-acquisition, its DPA story is actually the *stronger* of the two on the "auto-incorporated" axis: the Databricks Master Cloud Services Agreement (which now governs Neon self-serve use) incorporates the DPA by reference, Anthropic-style. The caveats: the legal stack is now Databricks paperwork (Neon, LLC as a Databricks affiliate), and the subprocessor page lists entity locations (US companies) rather than restating that your database bytes live in the region you picked — the regions doc is what pins data to Frankfurt.

**Supabase passes on residency and clarity but only partially on the DPA criterion**: it has a proper GDPR DPA with SCCs and a clear subprocessor schedule, and it's self-serve (dashboard, no sales call) — but it requires an actual signing step through PandaDoc, so it is not auto-incorporated. Nothing disqualifying for either provider.

**For the app host** (one paragraph each below): Hetzner is the cleanest GDPR story on the list (German company, German/Finnish data centers, free self-serve checkbox DPA). **Vercel's DPA explicitly excludes the Hobby plan** — a real strike against "free Vercel + EU Neon" for this app; Pro ($20/user/mo) is where the DPA starts. Railway and Fly.io both have one-EU-region-plus-DPA stories, each with a signature step.

One flag that belongs in the ballot briefing: training/recovery/health-adjacent athlete data can qualify as **special category data** (GDPR Art. 9 "data concerning health"), which raises the bar for everything (legal basis, security). Supabase's DPA form even has an explicit "special categories of personal data" checkbox to declare it. That's a question for the domain-expert/legal track, not for the host choice — but whichever host is picked, the DPA should be concluded *before* real athlete data lands in the database.

---

## Neon (default candidate, per ADR 0005)

### EU region — verified

Neon offers eight AWS regions, two of them European: **AWS Europe (Frankfurt) `aws-eu-central-1`** and AWS Europe (London) `aws-eu-west-2` ([Neon regions docs](https://neon.com/docs/introduction/regions)). Pedantry that matters for GDPR: London is in the UK, which left the EU — the UK has an EU adequacy decision, but if the criterion is "data at rest stays *in the EU*", **Frankfurt is Neon's one EU region**. The docs confirm region choice pins the data: "All branches and databases created in a Neon project are created in the region selected for the project", and region cannot be changed after creation (ibid.). (Neon's Azure regions, including Germany West Central, are deprecated — "no new project creation allowed", ibid.)

**Free plan**: the regions doc states no plan-based region restriction, and the pricing page's free tier (0.5 GB storage, 100 CU-hours per project) carries no region caveat ([Neon pricing](https://neon.com/pricing)). But no primary source was found that *positively* states "the free plan can create projects in Frankfurt" — this should be confirmed empirically in the two minutes it takes to create a free project and look at the region dropdown. Flagged rather than guessed.

### pgvector — verified

"pgvector is available on every Neon plan with no add-on or paid tier required" ([Neon pgvector docs](https://neon.com/docs/extensions/pgvector)); the pricing page confirms "All plans include ... Postgres extensions (pgvector, PostGIS, TimescaleDB, and more)" ([pricing](https://neon.com/pricing)).

### DPA — verified, auto-incorporated, but the paperwork is now Databricks'

The acquisition did change the legal pages. What used to be Neon's own terms is now a two-layer structure:

1. **neon.com/dpa no longer serves a Neon DPA.** It serves the "Neon Platform Services Product Specific Schedule", between "Neon, LLC ('Neon' or 'we'), an affiliate of Databricks, Inc." and the customer, which is "subject to the terms of the current Databricks Master Cloud Services Agreement located at https://www.databricks.com/legal/mcsa" ([Neon product schedule](https://neon.com/dpa), same content served at [neon.com/terms-of-service](https://neon.com/terms-of-service)). It applies to self-serve/usage-based customers ("The Neon Platform Services will be provided according to the usage-based pricing plan selected by Customer"), with continued use constituting consent to changes. Similarly, neon.com/privacy-policy now serves the *Databricks* Privacy Notice.
2. **The Databricks MCSA auto-incorporates the DPA**: "The terms of the DPA are incorporated by reference and shall apply to the processing of Personal Data as described in the DPA" (MCSA §1.1.4.1, [databricks.com/legal/mcsa](https://www.databricks.com/legal/mcsa)). This is the Anthropic-style shape the ticket asked for: accept the standard terms, and the DPA applies — no sales contact.

The DPA itself ([databricks.com/legal/dpa](https://www.databricks.com/legal/dpa), "Databricks DPA v3 (2023-07-21)") is a full GDPR Article 28 document: it "forms an integral part of the Databricks Master Cloud Services Agreement", defines SCCs as "the standard contractual clauses annexed to the European Commission's Implementing Decision 2021/914 of 4 June 2021", and attaches them as Annex B with "Module Two terms ... (where Customer is the controller)" — exactly this app's role. One honest wrinkle: the DPA document is *styled* as signable ("By signing this DPA, Customer enters into this DPA...", with a signature workflow page). The auto-application for self-serve customers rests on the MCSA's incorporation-by-reference clause, not on the DPA's own signature block. For belt-and-braces, Databricks also runs an automated signature workflow — but the MCSA language is the standing answer to "do I have a DPA without talking to anyone": yes.

Note the DPA names **Databricks, Inc. (US)** as the data importer under the SCCs — same structure as the Anthropic finding in ticket 01: the *company* is American and contracts under SCCs, while the *database region* keeps stored data in Frankfurt.

### Subprocessors — verified, with one nuance

Neon publishes a dedicated, Neon-specific list at [neon.com/subprocessors](https://neon.com/subprocessors) (last updated 16 April 2026): Salesforce (customer service), Grafana (infrastructure), **Amazon Web Services** and **Microsoft Azure** (infrastructure) — all with location given as "United States". The page states "This Sub-Processor page is incorporated into the DPA and Terms of Service or MSA entered into between Customer and Neon", and offers an email subscription for changes ([subscribe](https://neon.com/subscribe-to-subprocessors)); the DPA promises 30 days' notice before a new subprocessor processes data, with a 10-day objection window (Databricks DPA §4.3–4.4). The nuance: "United States" there is the *entity's* location (AWS the company), not where your rows live — the regions doc is the document that fixes storage to `aws-eu-central-1`. Both statements are true; cite both when explaining the setup.

Compliance posture for context: SOC 2 Type 1+2, ISO 27001 and ISO 27701, GDPR adherence stated; HIPAA only on the paid Scale plan ([Neon compliance docs](https://neon.com/docs/security/compliance); audit reports via [trust.neon.com](https://trust.neon.com/)).

**Neon bottom line**: passes criterion 1 (Frankfurt, data pinned to region), criterion 2 (DPA auto-incorporated via MCSA, SCCs included), criterion 3 (public subprocessor page + regions doc state the story clearly). Post-acquisition, "your DPA is with a Databricks affiliate under Databricks paperwork" is the fact to be comfortable with — the mechanics themselves got *more* self-serve, not less.

---

## Supabase (fallback — database only, not the whole platform)

### EU region — verified

Supabase projects deploy to a chosen AWS region at creation; the European options are **Ireland (`eu-west-1`), Paris (`eu-west-3`), Frankfurt (`eu-central-1`), Stockholm (`eu-north-1`)** — all EU — plus London (UK) and Zurich (Switzerland), which are European but not EU ([Supabase regions docs](https://supabase.com/docs/guides/platform/regions)). No plan-based region restriction is documented; as with Neon, "free tier can pick Frankfurt" is consistent with the docs but not explicitly promised — verify in the project-creation dialog. The free tier itself: 2 projects, 500 MB database, paused after 1 week of inactivity ([Supabase pricing](https://supabase.com/pricing)).

### pgvector — verified

pgvector is a standard Supabase extension — "a Postgres extension for vector similarity search. It can also be used for storing embeddings" — with no plan restriction documented ([Supabase pgvector docs](https://supabase.com/docs/guides/database/extensions/pgvector)).

### DPA — verified: real, self-serve, but requires signing

Supabase's process is explicit: a reviewable PDF is public, and "To make the DPA legally binding, you need to sign and complete the details through a PandaDoc document that we prepare", requested "from the legal documents page of your Supabase dashboard" ([supabase.com/legal/dpa](https://supabase.com/legal/dpa)). So: no sales call, but an actual execution step — **not auto-incorporated**. The current document (Part 2 "Version dated June 1, 2026", [DPA PDF](https://supabase.com/downloads/docs/Supabase+DPA+260601.pdf)) states that "from the date on which Customer signs or otherwise agrees to this DPA, [it] forms part of the Supabase Terms of Service". Whether the free tier can execute it was not verifiable from public pages (the dashboard legal-documents page sits behind login) — flagged, not assumed.

Contents check out: the contracting entity is **Supabase Pte. Ltd** (Singapore); SCCs are defined as "the Standard Contractual Clauses annexed to Commission Implementing Decision (EU) 2021/914" and §12.1 applies them "to the transfer of any Covered Data from Customer to Supabase ... to the extent that the GDPR or Swiss Data Protection Laws apply" (DPA PDF, ibid.). The DPA's Part 1 form includes a "Special categories of personal data" declaration checkbox — relevant if athlete data is classified as health data. Supabase also publishes a Transfer Impact Assessment ([TIA PDF](https://supabase.com/downloads/docs/Supabase+TIA+250314.pdf)) — the analysis GDPR expects a Controller to have when data can transit outside the EU.

### Subprocessors — verified

The list is **Schedule 3 of the DPA** (not a standalone public page): AWS, Cloudflare, Fly.io, Google, Vercel, Upstash (hosting/infrastructure); Sentry (errors); GitHub (auth); OpenAI ("natural language processing and generation services"); plus support/CRM tooling (Postmark, Front, HubSpot, Notion, Slack, PandaDoc, Atlassian, and others) (DPA PDF Schedule 3, ibid.). It's a noticeably longer list than Neon's four — more of the platform's moving parts touch customer data in some capacity.

**Supabase bottom line**: passes criterion 1 (four genuine EU regions — more choice than Neon), criterion 3 (DPA + TIA are unusually transparent), and *half* of criterion 2 (DPA exists and is self-serve, but needs a PandaDoc signature rather than being baked into the ToS). Using only its Postgres — connecting Next.js/better-auth straight to the Supabase connection string — is fully supported; the DPA covers the database service regardless of how much of the platform is used.

---

## App-hosting candidates — EU region + DPA, one paragraph each

The app server briefly holds the same athlete data in memory, so the host is also a Processor and needs the same two things: an EU region and a DPA.

**Vercel** — EU compute regions exist and the function region is settable per project even on the free Hobby plan (one region on Hobby; Frankfurt `fra1`, Paris `cdg1`, Dublin `dub1`, Stockholm `arn1` among the choices; default is Washington D.C. `iad1`) ([Vercel regions](https://vercel.com/docs/regions); [function region config & plan limits](https://vercel.com/docs/functions/configuring-functions/region)). The DPA includes the 2021 SCCs and is auto-incorporated — "This Addendum shall become legally binding upon Customer entering into the Agreement" — **but it explicitly applies only to "Customers who are on Enterprise and Pro plans"** ([Vercel DPA](https://vercel.com/legal/dpa), last updated 2026-03-17). So GDPR-correct Vercel hosting for this app effectively starts at Pro ($20/user/month) — which aligns with the existing finding that Hobby is non-commercial anyway.

**Railway** — one EU region: **EU West Metal, Amsterdam** (`europe-west4-drams3a`); volumes/databases "follow the region of the service to which they are attached" ([Railway regions docs](https://docs.railway.com/reference/deployment-regions)); whether region choice is available on the Hobby plan is not stated on that page (unverified). A GDPR DPA with EU SCCs "deemed entered into (and incorporated into this DPA by this reference)" is available self-serve, but it is executed by submitting a DocuSign form — "This DPA will become legally binding upon Company's execution" — so signed, not auto-incorporated ([Railway DPA](https://railway.com/legal/dpa); subprocessors via [trust.railway.com](https://trust.railway.com/)).

**Fly.io** — several genuinely EU regions (Amsterdam `ams`, Paris `cdg`, Frankfurt `fra`, Stockholm `arn`; London `lhr` is UK), and machines/volumes "are tied to the region they're created in" ([Fly.io regions](https://fly.io/docs/reference/regions/)). A GDPR DPA exists on the compliance page: "The agreement is pre-signed by Fly.io and will become active when signed by the customer" — self-serve but a signature step, and the document itself sits behind account login ([fly.io/documents](https://fly.io/documents/)).

**Hetzner** — the cleanest story of the four: a German company whose own data centers are **Falkenstein and Nuremberg (Germany) and Helsinki (Finland)** — all EU — with US/Singapore as clearly separated optional locations ([Hetzner Cloud locations](https://docs.hetzner.com/cloud/general/locations/)). The Art. 28 DPA is concluded self-serve in the customer account at accounts.hetzner.com/account/dpa: "A handwritten signature is not required. You give your consent by clicking the checkbox" — free, and it unlocks the annual TÜV-audited security report ([Hetzner data protection docs](https://docs.hetzner.com/general/others/data-protection/)). Choose an EU location and the data-residency question doesn't even arise. The trade-off is unchanged from earlier research: it's a VPS — you run the Node server, TLS, and updates yourself.

---

## What could not be verified (explicitly)

- **Neon free plan → Frankfurt**: no primary source states region availability per plan. Verify in the project-creation UI before finalizing.
- **Supabase free plan → DPA execution**: whether the dashboard legal-documents page (PandaDoc flow) is available on the free tier is behind login.
- **Railway region choice on Hobby plan**: the regions doc doesn't say.
- **Fly.io DPA contents** (SCCs, subprocessor terms): the document requires account login; only the compliance page's description was verifiable.

---

## Sources

**Neon / Databricks**
- Regions (Frankfurt/London, data pinned to region) — https://neon.com/docs/introduction/regions
- pgvector on every plan — https://neon.com/docs/extensions/pgvector
- Pricing (free tier, extensions on all plans) — https://neon.com/pricing
- Product Specific Schedule (Neon, LLC / Databricks affiliate; MCSA governs) — https://neon.com/dpa and https://neon.com/terms-of-service
- Databricks MCSA (DPA incorporated by reference, §1.1.4.1) — https://www.databricks.com/legal/mcsa
- Databricks DPA v3 2023-07-21 (SCCs 2021/914, Modules 2/3, subprocessor notice/objection) — https://www.databricks.com/legal/dpa
- Subprocessor list (updated 2026-04-16) — https://neon.com/subprocessors ; updates subscription — https://neon.com/subscribe-to-subprocessors
- Compliance (SOC 2, ISO 27001/27701, GDPR, HIPAA-on-Scale) — https://neon.com/docs/security/compliance ; trust center — https://trust.neon.com/

**Supabase**
- Regions — https://supabase.com/docs/guides/platform/regions
- pgvector — https://supabase.com/docs/guides/database/extensions/pgvector
- Pricing (free tier, pausing) — https://supabase.com/pricing
- DPA process (PandaDoc, dashboard) — https://supabase.com/legal/dpa
- DPA document v2026-06-01 (Supabase Pte. Ltd, SCCs §12, Schedule 3 subprocessors) — https://supabase.com/downloads/docs/Supabase+DPA+260601.pdf
- Transfer Impact Assessment — https://supabase.com/downloads/docs/Supabase+TIA+250314.pdf

**App hosts**
- Vercel regions — https://vercel.com/docs/regions ; function regions & plan limits — https://vercel.com/docs/functions/configuring-functions/region ; DPA (Pro/Enterprise only, auto-binding, SCCs) — https://vercel.com/legal/dpa
- Railway regions — https://docs.railway.com/reference/deployment-regions ; DPA (DocuSign, SCCs) — https://railway.com/legal/dpa ; trust center — https://trust.railway.com/
- Fly.io regions — https://fly.io/docs/reference/regions/ ; compliance documents (pre-signed DPA) — https://fly.io/documents/
- Hetzner Cloud locations — https://docs.hetzner.com/cloud/general/locations/ ; data protection / self-serve DPA — https://docs.hetzner.com/general/others/data-protection/
