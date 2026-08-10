'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import {
  CONSENT_PURPOSES,
  REQUIRED_CONSENT_PURPOSES,
  disclosureCopy,
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

const PRIMARY =
  'rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';
const SECONDARY =
  'rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900';

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
    <section className="flex w-full max-w-lg flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{heading}</h1>
        <p className="text-sm text-neutral-500">{intro}</p>
        <p className="text-xs leading-relaxed text-neutral-500">{copy.controller}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {CONSENT_PURPOSES.map((purpose) => {
          const p = copy.purposes[purpose];
          const required = isRequired(purpose);
          const isGranted = grantedSet.has(purpose);
          return (
            <li
              key={purpose}
              className="flex flex-col gap-1 rounded border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.title}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      {required ? copy.requiredLabel : copy.optionalLabel}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {p.body}
                  </p>
                </div>

                {mode === 'gate' && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
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
                        ? 'text-xs font-medium text-green-700 dark:text-green-500'
                        : 'text-xs text-neutral-500'
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
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
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
            <p className="text-xs text-neutral-500">{copy.requiredHint}</p>
          )}
        </div>
      ) : (
        <Link href="/" className="text-sm text-blue-500 underline">
          {copy.back}
        </Link>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {copy.retryError}
        </p>
      )}
    </section>
  );
}
