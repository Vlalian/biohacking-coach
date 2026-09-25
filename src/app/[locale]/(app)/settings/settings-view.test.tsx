import { describe, it, expect, vi } from 'vitest';
import { HOURS_PER_WEEK_MAX, HOURS_PER_WEEK_MIN } from '@/features/onboarding/onboarding-flow';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `showable-version/40` — the order of Settings' sections, and the hours field
 * in Training. Rendered to markup with the message keys standing in for copy,
 * so the order is the same claim in both locales.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'date' }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme: () => {} }) }));
vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/settings', useRouter: () => ({ replace: () => {} }) }));
vi.mock('@/components/auth/sign-out-button', () => ({ SignOutButton: () => null }));
vi.mock('@/components/change-password-form', () => ({ ChangePasswordForm: () => null }));
// The history upload's server actions are a boundary; nothing here calls them.
vi.mock('../../garmin-actions', () => ({ importHistoryAction: vi.fn(), removeImportedHistoryAction: vi.fn() }));

const { SettingsView } = await import('./settings-view');

const ok = async () => ({ ok: true }) as const;

function render(
  coachingLink: { headCoachName: string; shareAthleteReports: boolean; shareAiTranscripts: boolean } | null,
  historyImportedAt: string | null = null,
) {
  return renderToStaticMarkup(
    <SettingsView
      profile={{
        name: 'Mads',
        email: 'mads@example.com',
        communicationStyle: '',
        races: [],
        pastRaces: [],
        raceDistance: 'Full',
        hoursPerWeek: 9,
        historyImportedAt,
        importedHistoryCount: historyImportedAt ? 42 : 0,
        weeklySessionDay: null,
        fixedConstraints: [],
      }}
      language="en"
      preferredName=""
      coachingLink={coachingLink}
      onUpdateCommunicationStyle={ok}
      onAddRace={async () => ({ ok: true, raceId: 'r' })}
      onSetTargetRace={ok}
      onRemoveRace={ok}
      onAddPastRace={async () => ({ ok: true, pastRaceId: 'p' })}
      onRemovePastRace={ok}
      onUpdateRaceDistance={ok}
      onPreviewHoursChange={async () => ({ ok: true, weeks: [] })}
      onUpdateHoursPerWeek={async () => ({ ok: true, redrawn: 0 })}
      onUpdateWeeklySessionDay={ok}
      onAddFixedConstraint={ok}
      onRemoveFixedConstraint={ok}
      onUpdateLanguage={ok}
      onUpdatePreferredName={ok}
      onSetLinkVisibility={ok}
      onSeverCoachingLink={ok}
      onDeleteAccount={async () => ({ ok: true })}
    />,
  );
}

const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);

describe('SettingsView', () => {
  it('puts Training first: Training, Profile, Preferences, Sharing, Your data', () => {
    expect(headings(render({ headCoachName: 'Coach', shareAthleteReports: true, shareAiTranscripts: false }))).toEqual([
      'sectionTraining',
      'sectionProfile',
      'sectionPreferences',
      'sectionSharing',
      'sectionYourData',
    ]);
  });

  it('keeps the same order without a Coaching Link, Sharing simply absent', () => {
    expect(headings(render(null))).toEqual(['sectionTraining', 'sectionProfile', 'sectionPreferences', 'sectionYourData']);
  });

  it('shows the stored hours in Training, inside onboarding’s bounds', () => {
    const html = render(null);
    expect(html).toContain('hoursLabel');
    expect(html).toMatch(
      new RegExp(`id="settings-hours"[^>]*min="${HOURS_PER_WEEK_MIN}"[^>]*max="${HOURS_PER_WEEK_MAX}"[^>]*value="9"|value="9"[^>]*id="settings-hours"`),
    );
  });

  it('offers the history upload in Training while it is open, and the count and the remove once it is used', () => {
    const open = render(null);
    expect(open).toContain('choose');
    expect(open).toContain('multiple');
    expect(open).not.toContain('>remove<');
    const locked = render(null, '2026-09-20T10:00:00.000Z');
    expect(locked).not.toContain('choose');
    expect(locked).toContain('locked');
    expect(locked).toContain('>remove<');
  });
});
