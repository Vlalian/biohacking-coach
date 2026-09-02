import { redirect } from '@/i18n/navigation';

/**
 * The athlete surface has no landing page of its own — it opens on the Plan.
 *
 * Kept as a redirect rather than deleted so every link, bookmark and
 * `revalidatePath` written against `/coach/athlete/<id>` before the tabs
 * existed still resolves.
 */
export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ locale: string; athleteId: string }>;
}) {
  const { locale, athleteId } = await params;
  redirect({ href: `/coach/athlete/${athleteId}/plan`, locale });
}
