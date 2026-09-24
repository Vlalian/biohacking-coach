'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import {
  REQUIRED_CONSENT_PURPOSES,
  disclosureCopy,
  purposesToShow,
  type ConsentPurpose,
} from '@/features/consent/disclosure';
import { grantConsentsAction, withdrawConsentAction } from './consent-actions';

/**
 * The consent screen — the athlete's unbundled, per-purpose opt-in, and the
 * place they later withdraw.
 *
 * Two modes over one artifact. In `gate` mode it stands between the athlete and
 * the app: every processing purpose is ticked on its own (never one bundled
 * checkbox), and the primary action stays disabled until both required purposes
 * are agreed. In `manage` mode it lists what the athlete has granted and lets
 * them withdraw any of it — withdrawing a required purpose drops the gate back
 * into place on the next render.
 *
 * All wording comes from the versioned disclosure ({@link disclosureCopy}) in
 * the Athlete Language, so what the athlete reads is exactly what their grant is
 * stamped against.
 */

// The export's consent screen (2026-09-24) keeps a plain posture — no
// display face, no kicker — but sits on the theme's tokens and the control
// ladder rather than default greys.
const PRIMARY =
  'inline-flex h-11 w-full items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:cursor-not-allowed disabled:opacity-40';
const SECONDARY =
  'inline-flex h-10 items-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50';

function isRequired(purpose: ConsentPurpose): boolean {
  return REQUIRED_CONSENT_PURPOSES.includes(purpose);
}

export function ConsentScreen({
  granted,
  mode,
}: {
  granted: ConsentPurpose[];
  mode: 'gate' | 'manage';
}) {
  const locale = useLocale();
  const copy = useMemo(() => disclosureCopy(locale), [locale]);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  // Gate mode's local tick state, seeded from what is already granted so a
  // returning athlete (e.g. after a version bump) keeps their prior choices.
  const [checked, setChecked] = useState<Set<ConsentPurpose>>(
    () => new Set(granted),
  );

  const grantedSet = useMemo(() => new Set(granted), [granted]);
  // What this screen lists: the onboarding set, plus — in manage mode only —
  // any point-of-use purpose already granted, so it can be withdrawn here.
  const purposes = useMemo(() => purposesToShow(mode, granted), [mode, granted]);
  const allRequiredChecked = REQUIRED_CONSENT_PURPOSES.every((p) =>
    checked.has(p),
  );

  function toggle(purpose: ConsentPurpose) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(purpose)) next.delete(purpose);
      else next.add(purpose);
      return next;
    });
  }

  function run(action: () => Promise<{ ok: boolean }>, after?: () => void) {
    setError(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(true);
        return;
      }
      after?.();
    });
  }

  function agreeAndContinue() {
    run(
      () => grantConsentsAction([...checked]),
      // The page re-renders server-side; granting the last required purpose
      // lifts the gate on that render.
      () => router.refresh(),
    );
  }

  const heading = mode === 'gate' ? copy.heading : copy.manageHeading;
  const intro = mode === 'gate' ? copy.intro : copy.manageIntro;

  return (
    <section className="flex w-full max-w-lg flex-col gap-6 font-body text-foreground">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <p className="text-[15px] leading-relaxed text-foreground">{intro}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.controller}</p>
      </header>

      <ul className="flex flex-col gap-4">
        {purposes.map((purpose) => {
          const p = copy.purposes[purpose];
          const required = isRequired(purpose);
          const isGranted = grantedSet.has(purpose);
          return (
            <li
              key={purpose}
              className="flex flex-col gap-2 border border-border bg-panel p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-foreground">{p.title}</span>
                    <span className="border border-border px-2 py-0.5 text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                      {required ? copy.requiredLabel : copy.optionalLabel}
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-foreground">
                    {p.body}
                  </p>
                </div>

                {mode === 'gate' && (
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--signal)]"
                    checked={checked.has(purpose)}
                    disabled={pending}
                    onChange={() => toggle(purpose)}
                    aria-label={p.title}
                  />
                )}
              </div>

              {mode === 'manage' && (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    className={
                      isGranted
                        ? 'text-[15px] font-medium text-session-recovery'
                        : 'text-[15px] text-muted-foreground'
                    }
                  >
                    {isGranted ? copy.grantedState : copy.notGrantedState}
                  </span>
                  {isGranted ? (
                    <button
                      type="button"
                      disabled={pending}
                      className={SECONDARY}
                      onClick={() =>
                        run(() => withdrawConsentAction(purpose), () =>
                          router.refresh(),
                        )
                      }
                    >
                      {copy.withdraw}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      className={SECONDARY}
                      onClick={() =>
                        run(() => grantConsentsAction([purpose]), () =>
                          router.refresh(),
                        )
                      }
                    >
                      {copy.grant}
                    </button>
                  )}
                </div>
              )}

              {mode === 'manage' && required && isGranted && (
                <p className="mt-1 text-[13px] text-warning">
                  {copy.withdrawRequiredWarning}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {mode === 'gate' ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || !allRequiredChecked}
            className={PRIMARY}
            onClick={agreeAndContinue}
          >
            {copy.agree}
          </button>
          {!allRequiredChecked && (
            <p className="text-sm text-muted-foreground">{copy.requiredHint}</p>
          )}
        </div>
      ) : (
        <Link href="/" className="inline-flex h-10 items-center gap-2 border border-border px-4 font-body text-[15px] font-medium text-foreground no-underline transition-colors hover:border-signal hover:text-signal">
          {copy.back}
        </Link>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {copy.retryError}
        </p>
      )}
    </section>
  );
}
