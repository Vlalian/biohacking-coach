import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The Glossary View (CONTEXT.md): term-and-definition reference for the
 * training language the athlete meets in the plan and in the Coach's messages.
 * Deliberately narrow — terms only, static copy held in the catalogues, no
 * athlete state and nothing read from the database.
 *
 * Ported from the POC's `glossary-view`: three collapsible sections, the first
 * open on arrival. Native `<details>` does the folding — the same primitive the
 * Health Drawer's history uses — so there is nothing to hydrate and nothing to
 * remember between visits.
 *
 * The term ids are the catalogue's keys under `Glossary.<section>`; every
 * visible string resolves through next-intl (`glossary-view.test.tsx` pins
 * that structurally).
 */
const SECTIONS = [
  {
    id: 'training',
    title: 'trainingTitle',
    terms: [
      'zone2',
      'vo2max',
      'lactateThreshold',
      'ftp',
      'hrv',
      'tss',
      'aerobicBase',
      'periodisation',
    ],
  },
  {
    id: 'session',
    title: 'sessionTitle',
    terms: ['brick', 'interval', 'tempo', 'lsd', 'fartlek', 'recovery', 'openWater'],
  },
  {
    id: 'race',
    title: 'raceTitle',
    terms: [
      'transitions',
      'ageGroup',
      'wetsuitLegal',
      'dnf',
      'drafting',
      'specialNeeds',
      'ironman',
    ],
  },
] as const;

export function GlossaryView() {
  const t = useTranslations('Glossary');

  return (
    <div className="w-full max-w-5xl divide-y divide-border border border-border bg-panel">
      {SECTIONS.map((section, index) => (
        <details key={section.id} open={index === 0} className="group px-5 py-4">
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="mr-2 inline-block size-3 transition-transform group-open:rotate-90"
            />
            {t(section.title)}
          </summary>
          <dl className="mt-3 flex flex-col gap-3">
            {section.terms.map((term) => (
              <div key={term}>
                <dt className="font-body text-sm font-semibold text-foreground">
                  {t(`${section.id}.${term}.term`)}
                </dt>
                <dd className="mt-0.5 font-body text-sm text-muted-foreground">
                  {t(`${section.id}.${term}.definition`)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}
