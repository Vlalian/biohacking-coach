/**
 * The versioned consent disclosure — the single source of truth for *what* the
 * athlete is asked to consent to, and *which version* of that wording they saw.
 *
 * Everything the consent screen shows lives here, in both Athlete Languages,
 * rather than in the i18n catalogues. That is deliberate: a consent disclosure
 * is a legal artifact whose wording is versioned as a whole, and the parity-
 * tested message catalogues have no notion of a version. Keeping the copy here
 * ties the exact words to `DISCLOSURE_VERSION`, so a wording change and a version
 * bump are the same edit.
 *
 * This module is pure data — no `server-only`, no I/O — so the client screen and
 * the server both import it. Nothing here reaches the Anthropic API; the Coach
 * never sees a consent disclosure.
 *
 * ## 2026-09-01 — OpenAI named as a second processor
 *
 * The disclosure named **one** processor, Anthropic. The Knowledge Oracle adds a
 * second: embedding turns a query into a vector, and `embedder.ts` sends that
 * query text to OpenAI. Its own doc comment flagged exactly this and deferred it
 * to whoever built retrieval — *"that is athlete-derived text reaching a vendor
 * the consent artifact does not name."*
 *
 * At corpus-ingest time it was harmless: the text embedded is published papers,
 * not athlete data. It stops being harmless when a query built from an athlete's
 * **training state** is embedded, which is `knowledge-oracle/03` (built) wired in
 * by `knowledge-oracle/04` (not built).
 *
 * **So this describes processing that is not live yet, deliberately.** Consent
 * has to precede processing, not trail it, and the version bump is nearly free
 * *today* — no tester has been invited, so the grants it invalidates are the
 * builders' own. After the first invite the same bump would re-gate real people
 * mid-test. Cheap now, expensive later, and the cost only goes one way.
 *
 * What is claimed is deliberately narrow, and is a *structural* guarantee rather
 * than a filtered one (ADR 0006): the query is assembled from training state —
 * phase, experience level, question — and there is no name or email field on the
 * query type to interpolate. Athlete free text in the question is covered the
 * same way it already is for the Coach.
 */

/**
 * The processing purposes, each consented to on its own (unbundled). This array
 * is the app-side source of truth; the `consent.purpose` check constraint in the
 * database schema mirrors it. Changing the set is a migration, not a casual edit.
 */
export const CONSENT_PURPOSES = [
  'ai_coaching',
  'health_data',
  'injury_health_data',
  'head_coach_visibility',
  'product_improvement',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * The purposes the athlete MUST grant before any of their data is processed by
 * the AI Coach. `product_improvement` is deliberately absent: the coaching works
 * whether or not the athlete allows it, which is what makes the consent freely
 * given rather than a bundled condition of using the product.
 */
export const REQUIRED_CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  'ai_coaching',
  'health_data',
];

/**
 * Purposes asked at the moment they first matter, not on the consent screen.
 *
 * `injury_health_data` is asked the first time an athlete declares an Injury or
 * an Illness; `head_coach_visibility` when a Coaching Link is accepted. Neither
 * is required, and neither is put in front of every athlete at onboarding
 * (Mads, 2026-09-09).
 *
 * Two reasons, and they are different. **Unbundling**: an athlete must be able
 * to use the Coach and still decline to write injury notes — bundling those into
 * one tick would make the consent a condition of use rather than freely given,
 * which is the same principle that already keeps `product_improvement` out of
 * the required set. **Legibility**: most athletes never have a Head Coach, so
 * asking everyone up front to consent to something that may never happen adds
 * noise to the one screen that most needs to be read.
 */
export const POINT_OF_USE_PURPOSES: readonly ConsentPurpose[] = [
  'injury_health_data',
  'head_coach_visibility',
];

/**
 * The purposes the onboarding consent screen actually renders.
 *
 * Everything except {@link POINT_OF_USE_PURPOSES}. **Derived, not a third
 * hand-written list** — the review that added this found the screen mapping
 * `CONSENT_PURPOSES` directly, which put both point-of-use purposes in front of
 * every athlete at onboarding: precisely the noise the ruling rejected, and the
 * opposite of what ADR 0012 says the code does.
 *
 * Deriving it means a purpose added to either list above lands on the right
 * screen without anyone remembering to update a third one.
 */
export const ONBOARDING_CONSENT_PURPOSES: readonly ConsentPurpose[] = CONSENT_PURPOSES.filter(
  (purpose) => !POINT_OF_USE_PURPOSES.includes(purpose),
);

/**
 * The purposes one consent screen lists, in disclosure order.
 *
 * The gate shows the onboarding set and nothing else. The manage screen shows
 * that set **plus any point-of-use purpose the athlete has already granted** —
 * granted, not merely existing. Two reasons pull in opposite directions and this
 * is where they meet:
 *
 * - Withdrawal must be as easy as granting (Art. 7(3)). A grant made from an
 *   injury form has to be withdrawable from the one place an athlete goes to
 *   withdraw things, or it is a consent they can give but not take back.
 *   CodeRabbit found the manage screen mapping the onboarding list (PR #60),
 *   which made exactly that true.
 * - An *ungranted* point-of-use purpose is still not offered here. Listing it
 *   would make the manage screen a third asking surface, with no injury and no
 *   named coach in front of the athlete — the noise ADR 0012 keeps off every
 *   screen but the one where the question is concrete.
 */
export function purposesToShow(
  mode: 'gate' | 'manage',
  granted: readonly ConsentPurpose[],
): ConsentPurpose[] {
  if (mode === 'gate') return [...ONBOARDING_CONSENT_PURPOSES];
  return CONSENT_PURPOSES.filter(
    (purpose) => !POINT_OF_USE_PURPOSES.includes(purpose) || granted.includes(purpose),
  );
}

/**
 * The disclosure version. A grant is valid only while its stored version equals
 * this string, so bumping it on any wording change below invalidates every prior
 * grant and forces re-consent. Dated for legibility; the value is opaque to the
 * gate, which only compares it for equality.
 *
 * Pending the legal/privacy review the whole gdpr-decisions document calls for —
 * the wording here is the product's honest description of processing, not
 * lawyer-drafted final text. Revising it after that review is exactly the
 * version bump this mechanism exists for.
 *
 * `2026-08-07` → `2026-09-01`: OpenAI named as a second processor. See the
 * amendment at the top of this file for why it lands before the processing does.
 *
 * `2026-09-01` → `2026-09-10`: two purposes added — `injury_health_data` and
 * `head_coach_visibility` (`training-architecture/12`). Bumped **now, on
 * purpose**, while the only grant it invalidates is Mads's own. Re-consent costs
 * nothing today and becomes a wall of legal text in front of an invited tester's
 * first impression the moment testers exist; the timing was chosen against that
 * schedule rather than by accident (Mads, 2026-09-09).
 */
export const DISCLOSURE_VERSION = '2026-09-10';

/** Narrows an arbitrary string to a known purpose — untrusted input guard. */
export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

/** The copy for one purpose: a short title and the plain-language explanation. */
export interface PurposeCopy {
  title: string;
  body: string;
}

/** Everything the consent screen renders, in one language. */
export interface DisclosureCopy {
  /** Screen heading, gate framing, and the standing controller statement. */
  heading: string;
  intro: string;
  controller: string;
  /** The label distinguishing a required purpose from an optional one. */
  requiredLabel: string;
  optionalLabel: string;
  /** Gate primary action; disabled until every required purpose is ticked. */
  agree: string;
  /** Why the primary is disabled — shown when a required purpose is unticked. */
  requiredHint: string;
  /** Manage-mode strings: heading, per-purpose state, and the two actions. */
  manageHeading: string;
  manageIntro: string;
  grantedState: string;
  notGrantedState: string;
  grant: string;
  withdraw: string;
  /** Warning shown before withdrawing a required purpose (it re-gates the app). */
  withdrawRequiredWarning: string;
  back: string;
  /** Shown when a grant or withdrawal fails and the athlete should retry. */
  retryError: string;
  purposes: Record<ConsentPurpose, PurposeCopy>;
}

const EN: DisclosureCopy = {
  heading: 'Before we start: your data',
  intro:
    'To coach you, this app processes what you tell it and share with it. Please choose what you agree to below. You can change any of these later in Privacy & consent.',
  controller:
    'Your coaching data is processed by the app operator as data controller, and by two processors: Anthropic (Claude AI), which does the coaching itself, and OpenAI, which turns a training-science question into a search key for our reference library. Both run on servers in the United States under the safeguards in our data processing agreements. Your name and email are never sent to either.',
  requiredLabel: 'Required to use the Coach',
  optionalLabel: 'Optional',
  agree: 'Agree and continue',
  requiredHint: 'Tick both required items to continue.',
  manageHeading: 'Privacy & consent',
  manageIntro:
    'What you have agreed to let this app process. You can withdraw any of these at any time. Withdrawing a required item pauses the AI Coach until you grant it again.',
  grantedState: 'Granted',
  notGrantedState: 'Not granted',
  grant: 'Grant',
  withdraw: 'Withdraw',
  withdrawRequiredWarning:
    'This is required for coaching. Withdrawing it pauses the AI Coach until you grant it again.',
  back: 'Back to your plan',
  retryError: "That didn't work. Please try again.",
  purposes: {
    ai_coaching: {
      title: 'AI coaching',
      body: 'Let the AI Coach (Claude, by Anthropic) process your training data — your plan, sessions, ratings, and the messages you send it — to coach you. When the Coach looks something up in its training-science library, a short pseudonymous query — your training phase, your experience level, and your question — goes to OpenAI to be turned into a search key; the search itself runs on our own database. Without this the Coach cannot work.',
    },
    health_data: {
      title: 'Health-related signals',
      body: 'Let the app process the signals you report about your body — sleep, energy, how a session felt, resting pulse. These can reveal health information, which carries extra protection under GDPR (Article 9), so we ask for it explicitly.',
    },
    injury_health_data: {
      title: 'Injuries and illness you tell us about',
      body: 'Let the app store an injury or illness you report — what it stops you doing, and any notes you or your coach add. This is health information stated outright rather than inferred from training, so we ask separately. Only what it prevents ("can\'t run") ever reaches the AI Coach; your notes never do.',
    },
    head_coach_visibility: {
      title: 'Letting a human coach see your data',
      body: 'If you link with a human Head Coach, let them see the data you choose to share with them — your plan, and whichever of your reports and conversations you leave switched on. A second person reading your training is different from an app processing it, so we ask for it separately, and only when you actually link with someone.',
    },
    product_improvement: {
      title: 'Help improve the product',
      body: 'Allow your anonymised coaching interactions to be used to improve the app. This is entirely optional and never affects your coaching.',
    },
  },
};

const DA: DisclosureCopy = {
  heading: 'Før vi starter: dine data',
  intro:
    'For at kunne coache dig behandler appen det, du fortæller og deler med den. Vælg nedenfor, hvad du giver samtykke til. Du kan altid ændre det senere under Privatliv & samtykke.',
  controller:
    'Dine coachingdata behandles af appudbyderen som dataansvarlig og af to databehandlere: Anthropic (Claude AI), som står for selve coachingen, og OpenAI, som omdanner et træningsfagligt spørgsmål til en søgenøgle til vores kildebibliotek. Begge kører på servere i USA under de sikkerhedsforanstaltninger, der står i vores databehandleraftaler. Dit navn og din e-mail sendes aldrig til nogen af dem.',
  requiredLabel: 'Krævet for at bruge Coachen',
  optionalLabel: 'Valgfrit',
  agree: 'Accepter og fortsæt',
  requiredHint: 'Sæt flueben ved begge krævede punkter for at fortsætte.',
  manageHeading: 'Privatliv & samtykke',
  manageIntro:
    'Det, du har givet appen lov til at behandle. Du kan til enhver tid trække et samtykke tilbage. Trækker du et krævet punkt tilbage, sættes AI-Coachen på pause, indtil du giver det igen.',
  grantedState: 'Givet',
  notGrantedState: 'Ikke givet',
  grant: 'Giv samtykke',
  withdraw: 'Træk tilbage',
  withdrawRequiredWarning:
    'Dette er krævet for coaching. Trækker du det tilbage, sættes AI-Coachen på pause, indtil du giver det igen.',
  back: 'Tilbage til din plan',
  retryError: 'Det virkede ikke. Prøv igen.',
  purposes: {
    ai_coaching: {
      title: 'AI-coaching',
      body: 'Lad AI-Coachen (Claude fra Anthropic) behandle dine træningsdata — din plan, dine sessioner, dine vurderinger og de beskeder, du sender — for at coache dig. Når Coachen slår noget op i sit træningsfaglige bibliotek, sendes en kort pseudonym forespørgsel — din træningsfase, dit erfaringsniveau og dit spørgsmål — til OpenAI for at blive omdannet til en søgenøgle; selve søgningen kører på vores egen database. Uden dette kan Coachen ikke fungere.',
    },
    health_data: {
      title: 'Helbredsrelaterede signaler',
      body: 'Lad appen behandle de signaler, du rapporterer om din krop — søvn, energi, hvordan en session føltes, hvilepuls. De kan afsløre helbredsoplysninger, som har ekstra beskyttelse under GDPR (artikel 9), og derfor spørger vi udtrykkeligt om det.',
    },
    injury_health_data: {
      title: 'Skader og sygdom, du fortæller om',
      body: 'Lad appen gemme en skade eller sygdom, du rapporterer — hvad den forhindrer dig i, og de noter du eller din træner tilføjer. Det er helbredsoplysninger sagt direkte og ikke udledt af træning, så vi spørger særskilt. Kun det, den forhindrer ("kan ikke løbe"), når frem til AI-Coachen; dine noter gør aldrig.',
    },
    head_coach_visibility: {
      title: 'At lade en menneskelig træner se dine data',
      body: 'Hvis du knytter dig til en menneskelig træner, så lad vedkommende se de data, du vælger at dele — din plan og de af dine rapporter og samtaler, du lader stå til. At et andet menneske læser din træning er noget andet end at en app behandler den, så vi spørger særskilt, og kun når du faktisk knytter dig til nogen.',
    },
    product_improvement: {
      title: 'Hjælp med at forbedre produktet',
      body: 'Tillad, at dine anonymiserede coaching-interaktioner bruges til at forbedre appen. Det er helt valgfrit og påvirker aldrig din coaching.',
    },
  },
};

/** The disclosure copy for an Athlete Language; English is the default. */
export function disclosureCopy(locale: string): DisclosureCopy {
  return locale === 'da' ? DA : EN;
}
