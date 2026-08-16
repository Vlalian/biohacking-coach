import { notFound } from 'next/navigation';

/**
 * Catch-all for unmatched paths inside a locale.
 *
 * Without this, `/en/anything-wrong` matches no route at all, so Next falls
 * through to the *root* `app/not-found.tsx` — outside the `[locale]` segment,
 * and therefore with no locale, no i18n provider and no theme. Calling
 * `notFound()` from inside the segment is what lets `[locale]/not-found.tsx`
 * render instead, in the athlete's own language. This is next-intl's
 * documented pattern for a localised 404.
 */
export default function CatchAllNotFound() {
  notFound();
}
