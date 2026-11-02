'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDot,
  Clock3,
  MessageCircle,
  ShieldCheck,
  Users,
  Watch,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import type { FrontpageImage, FrontpageScreenshots } from './screenshots';

type Locale = (typeof routing.locales)[number];

/**
 * The Frontpage (showable-version/62): what a signed-out visitor meets at `/`
 * instead of the sign-in form. Ported from Lovable's design with its markup and
 * classes kept; every string comes from the `Frontpage` catalogue, and the app's
 * own View names from `Shell`, so Danish reads the app's Danish. The locale and
 * the theme come from the app's routing and ThemeProvider, not from the page.
 */
export function FrontpageView({ locale, screenshots }: { locale: Locale; screenshots: FrontpageScreenshots }) {
  const t = useTranslations('Frontpage');
  const shell = useTranslations('Shell');
  const views = {
    roster: shell('viewRoster'),
    trainingPlan: shell('viewTrainingPlan'),
    information: shell('viewInformation'),
  };
  const signInClass =
    'group h-11 rounded-sm bg-signal px-6 font-body text-base font-semibold text-signal-foreground shadow-none hover:bg-signal/85';
  const features = [
    { icon: CalendarDays, title: t('planningTitle'), body: t('planningBody') },
    { icon: MessageCircle, title: t('contactTitle'), body: t('contactBody') },
    { icon: Users, title: t('overviewTitle'), body: t('overviewBody', views) },
    { icon: ArrowLeftRight, title: t('missedTitle'), body: t('missedBody') },
  ];
  const languageSwitch = () => (
    <div role="group" className="flex items-center text-auth-muted" aria-label={t('language')}>
      {routing.locales.map((lang) => (
        <Button
          key={lang}
          asChild
          variant="ghost"
          className={`h-11 rounded-none px-3 font-mono text-xs uppercase hover:bg-auth-surface hover:text-auth-foreground ${locale === lang ? 'text-auth-foreground' : ''}`}
        >
          <Link href="/" locale={lang} aria-current={locale === lang ? 'true' : undefined}>
            {lang.toUpperCase()}
          </Link>
        </Button>
      ))}
    </div>
  );
  const brand = <Brand name={t('brand')} />;

  return (
    <div lang={locale} className="overflow-x-clip bg-background font-body text-foreground">
      <section className="front-hero relative isolate bg-auth-canvas text-auth-foreground">
        <Image
          src="/momentum-signin-cyclist.jpg"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-[65%_center]"
        />
        <div className="front-hero-shade absolute inset-0 -z-10" aria-hidden="true" />
        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-10 lg:px-14">
          {brand}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">{languageSwitch()}</div>
            <Button
              asChild
              variant="ghost"
              className="h-11 rounded-sm border border-auth-line px-4 text-base text-auth-foreground hover:bg-auth-surface hover:text-auth-foreground"
            >
              <Link href="/sign-in">
                {t('signIn')}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-5 pb-10 pt-12 sm:px-10 sm:pt-16 lg:px-14">
          <p className="mb-5 flex items-center gap-3 font-mono text-xs uppercase text-auth-muted">
            <span className="h-0.5 w-7 bg-signal" />
            {t('eyebrow')}
          </p>
          <h1 className="font-display text-[72px] font-bold uppercase italic leading-none sm:text-[104px] lg:text-[124px]">
            {t('brand')}
            <span className="text-signal">.</span>
          </h1>
          <h2 className="mt-5 max-w-[650px] font-display text-[30px] font-medium leading-tight sm:text-[40px]">
            {t('headline')}
          </h2>
          <p className="mt-5 max-w-[510px] text-lg leading-relaxed text-auth-muted">{t('intro')}</p>
          <Button asChild className={`mt-7 ${signInClass}`}>
            <Link href="/sign-in">
              {t('signIn')}
              <ArrowRight className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
            </Link>
          </Button>
        </div>
        <div className="mx-auto max-w-7xl px-5 pb-8 sm:px-10 lg:px-14">
          <div className="flex items-center justify-between gap-2 border-t border-auth-line pt-5 sm:justify-start sm:gap-8">
            {[
              { icon: Activity, title: t('athlete'), detail: t('athleteRole') },
              { icon: CircleDot, title: t('brand'), detail: t('momentumRole') },
              { icon: Users, title: t('coach'), detail: t('coachRole') },
            ].map((node, i) => (
              <div key={node.title} className="contents">
                {i > 0 && (
                  <ArrowLeftRight
                    className={`h-4 w-4 shrink-0 ${i === 2 ? 'text-auth-muted' : 'text-signal'}`}
                    aria-hidden="true"
                  />
                )}
                <div className={`min-w-0 ${i === 2 ? 'border-b border-dashed border-auth-line pb-1' : ''}`}>
                  <div className="flex items-center gap-2">
                    <node.icon className="hidden h-4 w-4 sm:block" />
                    <span className="font-display text-base uppercase sm:text-lg">{node.title}</span>
                  </div>
                  <p className="mt-1 hidden text-sm text-auth-muted sm:block">{node.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-auth-muted">{t('optional')}</p>
        </div>
      </section>

      <main>
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-10 sm:py-24 lg:px-14">
          <p className="front-eyebrow">{t('storyEyebrow')}</p>
          <h2 className="front-heading mt-3">{t('storyTitle')}</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t('storyIntro')}</p>
          <div className="mt-12 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div className="relative pb-10 pr-12 sm:pr-24">
              <Preview image={screenshots.rosterView} title={views.roster} caption={t('placeholder')} />
              <div className="absolute bottom-0 right-0 w-[32%] min-w-[130px]">
                <Preview image={screenshots.coachChat} title={t('coachChat')} caption={t('placeholder')} phone />
              </div>
            </div>
            <div className="divide-y divide-border">
              {features.slice(0, 2).map((f, i) => (
                <article key={f.title} className="py-6 first:pt-0">
                  <p className="flex items-center gap-3 font-mono text-xs text-signal">
                    <f.icon size={18} />
                    <span>{`0${i + 1}`}</span>
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-medium">{f.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="mt-16 grid gap-10 border-t border-border pt-12 md:grid-cols-2">
            {features.slice(2).map((f, i) => (
              <article key={f.title}>
                <p className="flex items-center gap-3 font-mono text-xs text-signal">
                  <f.icon size={18} />
                  <span>{`0${i + 3}`}</span>
                </p>
                <h3 className="mt-3 font-display text-2xl font-medium">{f.title}</h3>
                <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <Preview image={screenshots.trainingPlan} title={views.trainingPlan} caption={t('placeholder')} />
            <Preview image={screenshots.informationView} title={views.information} caption={t('placeholder')} />
          </div>
        </section>

        <section className="bg-auth-canvas text-auth-foreground">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-10 sm:py-24 lg:px-14">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
              <div>
                <p className="front-eyebrow">{t('whyEyebrow')}</p>
                <h2 className="front-heading mt-3 whitespace-pre-line">{t('whyTitle')}</h2>
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-auth-muted">{t('whyIntro')}</p>
              </div>
              <div className="divide-y divide-auth-line">
                {[
                  { title: t('authorityTitle'), body: t('authorityBody') },
                  { title: t('negotiateTitle'), body: t('negotiateBody') },
                ].map((f, i) => (
                  <article key={f.title} className="py-6 first:pt-0">
                    <span className="font-display text-3xl text-sidebar-primary">{`0${i + 1}`}</span>
                    <h3 className="mt-2 font-display text-2xl">{f.title}</h3>
                    <p className="mt-3 text-base leading-relaxed text-auth-muted">{f.body}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="mt-12 grid gap-8 border-t border-auth-line pt-10 md:grid-cols-3">
              {[
                { title: t('uncertaintyTitle'), body: t('uncertaintyBody') },
                { title: t('scienceTitle'), body: t('scienceBody') },
                { title: t('adaptTitle'), body: t('adaptBody') },
              ].map((f) => (
                <article key={f.title}>
                  <Check size={20} className="text-signal" />
                  <h3 className="mt-3 font-display text-xl">{f.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-auth-muted">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-muted/40">
          <div className="mx-auto grid max-w-7xl gap-7 px-5 py-10 sm:px-10 md:grid-cols-[1fr_1.2fr_1.2fr] lg:px-14">
            <p className="flex items-start gap-2 font-mono text-xs uppercase text-muted-foreground">
              <Clock3 size={16} className="shrink-0" />
              {t('coming')}
            </p>
            {[
              { icon: Watch, title: t('garmin'), body: t('garminBody') },
              { icon: MessageCircle, title: t('briefing'), body: t('briefingBody') },
            ].map((f) => (
              <div key={f.title}>
                <h3 className="flex items-center gap-3 font-display text-xl">
                  <f.icon size={18} className="text-muted-foreground" />
                  {f.title}
                </h3>
                <p className="mt-2 text-base text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="front-hero relative isolate bg-auth-canvas text-auth-foreground">
          <Image
            src="/momentum-endurance-open-water-woman.jpg"
            alt=""
            aria-hidden="true"
            fill
            sizes="100vw"
            className="-z-20 object-cover object-[70%_center]"
          />
          <div className="front-hero-shade absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-10 sm:py-24 lg:px-14">
            <span className="mb-8 inline-flex items-center gap-2 border border-auth-line bg-auth-canvas/85 px-4 py-2 font-mono text-xs uppercase text-auth-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              {t('pilot')}
            </span>
            <p className="front-eyebrow">{t('trustEyebrow')}</p>
            <h2 className="front-heading mt-3 max-w-xl">{t('trustTitle')}</h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-auth-muted">{t('trustIntro')}</p>
            <div className="mt-7 max-w-xl divide-y divide-auth-line">
              {[
                { title: t('euTitle'), body: t('euBody') },
                { title: t('researchTitle'), body: t('researchBody') },
                { title: t('sourcesTitle'), body: t('sourcesBody') },
              ].map((f) => (
                <div key={f.title} className="flex gap-4 py-5">
                  <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-signal" />
                  <div>
                    <h3 className="font-display text-xl">{f.title}</h3>
                    <p className="mt-1 text-base text-auth-muted">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-auth-canvas text-auth-foreground">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-10 lg:px-14">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div>
              {brand}
              <p className="mt-3 text-base text-auth-muted">{t('footerLine')}</p>
            </div>
            <Button asChild className={signInClass}>
              <Link href="/sign-in">
                {t('signIn')}
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-auth-line pt-5">
            <span className="text-xs text-auth-muted">{t('copyright')}</span>
            <div className="flex items-center gap-4">
              <Button
                asChild
                variant="ghost"
                className="h-11 px-2 text-sm text-auth-muted hover:bg-auth-surface hover:text-auth-foreground"
              >
                <Link href="/privacy">{t('privacy')}</Link>
              </Button>
              {languageSwitch()}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2" aria-label={name}>
      <svg viewBox="0 0 76 32" className="h-7 w-14 shrink-0" fill="none" aria-hidden="true">
        <path d="M2 26 7 11q2-6 7-6t4 6l-5 15 5-15q2-6 7-6t4 6l-5 15" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path d="M22 26 27 11q2-6 7-6t4 6l-5 15 5-15q2-6 7-6t4 6l-5 15" stroke="currentColor" strokeWidth="4" className="opacity-50" />
        <path d="M42 26 47 11q2-6 7-6t4 6l-5 15 5-15q2-6 7-6t4 6l-5 15" stroke="currentColor" strokeWidth="4" className="text-signal" />
      </svg>
      <span className="momentum-wordmark text-xl font-extrabold uppercase italic sm:text-2xl">{name}</span>
    </span>
  );
}

/** A device frame around one picture of the app, or its placeholder while the picture has no `src`. */
function Preview({
  image,
  title,
  caption,
  phone = false,
}: {
  image: FrontpageImage;
  title: string;
  caption: string;
  phone?: boolean;
}) {
  return (
    <figure className={phone ? 'mx-auto w-[220px] max-w-full' : 'w-full'}>
      <div
        className={
          phone
            ? 'rounded-[24px] border-[6px] border-front-device bg-front-device p-1'
            : 'rounded-t-lg border-[8px] border-front-device bg-front-device'
        }
      >
        {phone && <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-auth-muted/40" aria-hidden="true" />}
        <div className={`relative overflow-hidden bg-muted ${phone ? 'aspect-[9/16] rounded-2xl' : 'aspect-[16/10] rounded-sm'}`}>
          {image.src ? (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes={phone ? '220px' : '(min-width: 1024px) 640px, 100vw'}
              className="object-cover object-top"
            />
          ) : (
            <div className="flex h-full flex-col p-4 text-muted-foreground">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <CircleDot size={14} className="text-signal" />
                <span className="font-display text-base uppercase">{title}</span>
              </div>
              <div className="mt-4 grid flex-1 grid-cols-[1fr_3fr] gap-3" aria-hidden="true">
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-2 bg-foreground/10" />
                  ))}
                </div>
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-9 border-l-2 border-foreground/20 bg-foreground/5" />
                  ))}
                </div>
              </div>
              <p className="mt-4 text-center font-body text-sm">{caption}</p>
            </div>
          )}
        </div>
      </div>
      {!phone && <div className="mx-[-3%] h-3 rounded-b-xl border-t border-auth-line bg-front-device" aria-hidden="true" />}
      <figcaption className="mt-4 text-center font-mono text-xs uppercase text-muted-foreground">{title}</figcaption>
    </figure>
  );
}
