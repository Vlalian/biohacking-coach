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
 */

/**
 * The processing purposes, each consented to on its own (unbundled). This array
 * is the app-side source of truth; the `consent.purpose` check constraint in the
 * database schema mirrors it. Changing the set is a migration, not a casual edit.
 */
export const CONSENT_PURPOSES = [
  'ai_coaching',
  'health_data',
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
 * The disclosure version. A grant is valid only while its stored version equals
 * this string, so bumping it on any wording change below invalidates every prior
 * grant and forces re-consent. Dated for legibility; the value is opaque to the
 * gate, which only compares it for equality.
 *
 * Pending the legal/privacy review the whole gdpr-decisions document calls for —
 * the wording here is the product's honest description of processing, not
 * lawyer-drafted final text. Revising it after that review is exactly the
 * version bump this mechanism exists for.
 */
export const DISCLOSURE_VERSION = '2026-08-07';

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
    'Your coaching data is processed by the app operator as data controller, and by Anthropic (Claude AI) as a processor. AI processing runs on servers in the United States under the safeguards in our data processing agreement. Your name and email are never sent to the AI.',
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
      body: 'Let the AI Coach (Claude, by Anthropic) process your training data — your plan, sessions, ratings, and the messages you send it — to coach you. Without this the Coach cannot work.',
    },
    health_data: {
      title: 'Health-related signals',
      body: 'Let the app process the signals you report about your body — sleep, energy, how a session felt, resting pulse. These can reveal health information, which carries extra protection under GDPR (Article 9), so we ask for it explicitly.',
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
    'Dine coachingdata behandles af appudbyderen som dataansvarlig og af Anthropic (Claude AI) som databehandler. AI-behandlingen kører på servere i USA under de sikkerhedsforanstaltninger, der står i vores databehandleraftale. Dit navn og din e-mail sendes aldrig til AI’en.',
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
      body: 'Lad AI-Coachen (Claude fra Anthropic) behandle dine træningsdata — din plan, dine sessioner, dine vurderinger og de beskeder, du sender — for at coache dig. Uden dette kan Coachen ikke fungere.',
    },
    health_data: {
      title: 'Helbredsrelaterede signaler',
      body: 'Lad appen behandle de signaler, du rapporterer om din krop — søvn, energi, hvordan en session føltes, hvilepuls. De kan afsløre helbredsoplysninger, som har ekstra beskyttelse under GDPR (artikel 9), og derfor spørger vi udtrykkeligt om det.',
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
