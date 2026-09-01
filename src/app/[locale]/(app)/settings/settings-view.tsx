'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSave, useSaveStatus } from './use-save';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Check, Download, Loader2, LogOut, Moon, Sun, SunMoon } from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import type { SettingsActionResult } from './settings-actions';
import type { DeleteAccountResult } from './erasure-actions';

/** The profile fields Settings reads and edits — a narrower shape than the
 *  stored {@link import('@/features/athlete/athlete').Athlete}, resolved by
 *  the page from the athlete row plus the better-auth user. */
export interface SettingsProfile {
  name: string;
  email: string;
  communicationStyle: string;
  raceTarget: string;
  weeklySessionDay: string | null;
  fixedConstraints: string[];
}

/** The athlete's own Coaching Link, as Settings shows and edits it. Absent
 *  entirely (not present with nulls) when the athlete trains solo — that
 *  absence is what hides the whole Sharing section. */
export interface SettingsCoachingLink {
  headCoachName: string;
  shareAthleteReports: boolean;
  shareAiTranscripts: boolean;
}

export interface SettingsViewProps {
  profile: SettingsProfile;
  language: string;
  coachingLink: SettingsCoachingLink | null;
  onUpdateCommunicationStyle: (value: string) => Promise<SettingsActionResult>;
  onUpdateRaceTarget: (value: string) => Promise<SettingsActionResult>;
  onUpdateWeeklySessionDay: (day: string) => Promise<SettingsActionResult>;
  onAddFixedConstraint: (day: string) => Promise<SettingsActionResult>;
  onRemoveFixedConstraint: (day: string) => Promise<SettingsActionResult>;
  onUpdateLanguage: (language: string) => Promise<SettingsActionResult>;
  onSetLinkVisibility: (
    section: 'shareAthleteReports' | 'shareAiTranscripts',
    on: boolean,
  ) => Promise<SettingsActionResult>;
  onSeverCoachingLink: () => Promise<SettingsActionResult>;
  /** Erases the account. Takes the email the athlete typed, re-checked server-side. */
  onDeleteAccount: (confirmation: string) => Promise<DeleteAccountResult>;
}

const DAYS = ONBOARDING_OPTIONS.days;
const DAY_KEYS = [
  'dayMonday',
  'dayTuesday',
  'dayWednesday',
  'dayThursday',
  'dayFriday',
  'daySaturday',
  'daySunday',
] as const;

/**
 * Settings — durable preferences and, in Coached Mode, Link Visibility
 * (`lovable/briefs/settings.md`). One scrolling page of sections, matching
 * how Equipment reads in this theme: Profile, Preferences, Training, and —
 * only when a Coaching Link exists — Sharing.
 *
 * Link Visibility renders exactly the two flags the schema actually carries
 * (`shareAthleteReports`, `shareAiTranscripts`) — CONTEXT.md's six named
 * sections are real, but the implementation collapsed them into these two
 * booleans on purpose (`link-visibility.ts`), so the UI groups honestly
 * around what a toggle here truly does rather than implying finer control
 * than the server enforces.
 */
export function SettingsView({
  profile,
  language,
  coachingLink,
  onUpdateCommunicationStyle,
  onUpdateRaceTarget,
  onUpdateWeeklySessionDay,
  onAddFixedConstraint,
  onRemoveFixedConstraint,
  onUpdateLanguage,
  onSetLinkVisibility,
  onSeverCoachingLink,
  onDeleteAccount,
}: SettingsViewProps) {
  const t = useTranslations('Settings');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <header className="border-b border-border pb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-5xl tracking-[0.04em] text-foreground">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-md font-body text-sm text-muted-foreground">
            {t('lede')}
          </p>
        </header>

        <ProfileSection name={profile.name} email={profile.email} />

        <PreferencesSection language={language} onUpdateLanguage={onUpdateLanguage} />

        <TrainingSection
          communicationStyle={profile.communicationStyle}
          raceTarget={profile.raceTarget}
          weeklySessionDay={profile.weeklySessionDay}
          fixedConstraints={profile.fixedConstraints}
          onUpdateCommunicationStyle={onUpdateCommunicationStyle}
          onUpdateRaceTarget={onUpdateRaceTarget}
          onUpdateWeeklySessionDay={onUpdateWeeklySessionDay}
          onAddFixedConstraint={onAddFixedConstraint}
          onRemoveFixedConstraint={onRemoveFixedConstraint}
        />

        {coachingLink && (
          <SharingSection
            link={coachingLink}
            onSetLinkVisibility={onSetLinkVisibility}
            onSeverCoachingLink={onSeverCoachingLink}
          />
        )}

        <YourDataSection email={profile.email} onDeleteAccount={onDeleteAccount} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </h2>
      <div className="mt-4 space-y-6 border border-border bg-panel p-5">{children}</div>
    </section>
  );
}

function ProfileSection({ name, email }: { name: string; email: string }) {
  const t = useTranslations('Settings');
  return (
    <Section label={t('sectionProfile')}>
      <ReadOnlyField label={t('nameLabel')} value={name} />
      <ReadOnlyField label={t('emailLabel')} value={email} />
      {/* Second home for sign-out. The Navigation Drawer carries the primary
       *  one; Settings is where a user instinctively looks for account
       *  actions, so it is reachable from both rather than only the drawer. */}
      <div className="border-t border-rule pt-4">
        <SignOutButton
          className="inline-flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground no-underline transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
          icon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
        />
      </div>
    </Section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-body text-sm text-foreground">{value}</p>
    </div>
  );
}

function PreferencesSection({
  language,
  onUpdateLanguage,
}: {
  language: string;
  onUpdateLanguage: (language: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { pending, error, run } = useSave();
  // next-themes cannot know the stored theme until it runs in the browser, so
  // the server renders no tile as active and the client renders one — a real
  // hydration mismatch (caught in the console while browser-testing). Gating on
  // mount makes both passes agree: nothing selected until we genuinely know.
  //
  // useSyncExternalStore rather than an effect: it is the sanctioned way to read
  // "am I hydrated" (server snapshot false, client snapshot true) without a
  // setState that React would rather we did not run on every mount.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const activeTheme = mounted ? theme : undefined;

  async function chooseLanguage(next: string) {
    if (next === language) return;
    if (await run(() => onUpdateLanguage(next))) router.replace(pathname, { locale: next });
  }

  return (
    <Section label={t('sectionPreferences')}>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('themeLabel')}
        </p>
        <div className="mt-2 flex gap-2">
          <ThemeTile
            active={activeTheme === 'light'}
            onClick={() => setTheme('light')}
            icon={<Sun className="h-3.5 w-3.5" />}
            label={t('themeLight')}
          />
          <ThemeTile
            active={activeTheme === 'dark'}
            onClick={() => setTheme('dark')}
            icon={<Moon className="h-3.5 w-3.5" />}
            label={t('themeDark')}
          />
          <ThemeTile
            active={activeTheme === 'system'}
            onClick={() => setTheme('system')}
            icon={<SunMoon className="h-3.5 w-3.5" />}
            label={t('themeSystem')}
          />
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('languageLabel')}
        </p>
        <p className="mt-1 font-body text-xs text-muted-foreground">{t('languageNote')}</p>
        <div className="mt-2 flex items-center gap-2">
          {ONBOARDING_OPTIONS.language.map((code) => (
            <DayTile
              key={code}
              label={code === 'en' ? 'English' : 'Dansk'}
              selected={language === code}
              onClick={() => chooseLanguage(code)}
              disabled={pending}
            />
          ))}
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {error && <FieldError message={t('error')} />}
      </div>
    </Section>
  );
}

function ThemeTile({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={[
        'inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors',
        active
          ? 'border-signal text-signal'
          : 'border-border text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

function TrainingSection({
  communicationStyle,
  raceTarget,
  weeklySessionDay,
  fixedConstraints,
  onUpdateCommunicationStyle,
  onUpdateRaceTarget,
  onUpdateWeeklySessionDay,
  onAddFixedConstraint,
  onRemoveFixedConstraint,
}: {
  communicationStyle: string;
  raceTarget: string;
  weeklySessionDay: string | null;
  fixedConstraints: string[];
  onUpdateCommunicationStyle: (value: string) => Promise<SettingsActionResult>;
  onUpdateRaceTarget: (value: string) => Promise<SettingsActionResult>;
  onUpdateWeeklySessionDay: (day: string) => Promise<SettingsActionResult>;
  onAddFixedConstraint: (day: string) => Promise<SettingsActionResult>;
  onRemoveFixedConstraint: (day: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');

  return (
    <Section label={t('sectionTraining')}>
      <RaceTargetField value={raceTarget} onSave={onUpdateRaceTarget} />
      <CommunicationStyleField
        value={communicationStyle}
        onSave={onUpdateCommunicationStyle}
      />
      <WeeklySessionDayField value={weeklySessionDay} onSave={onUpdateWeeklySessionDay} />
      <FixedConstraintsField
        value={fixedConstraints}
        onAdd={onAddFixedConstraint}
        onRemove={onRemoveFixedConstraint}
      />
    </Section>
  );
}

/**
 * The race target — the fixed point the whole plan is built backwards from, and
 * until now write-once at onboarding. Clearable: an athlete between races has
 * no target, and an empty value stores null rather than "".
 */
function RaceTargetField({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [draft, setDraft] = useState(value);
  const { status, reset, run } = useSaveStatus();
  const dirty = draft.trim() !== value.trim();

  const save = () => run(() => onSave(draft));

  return (
    <div>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('raceTargetLabel')}
        </span>
        <p className="mt-1 font-body text-xs text-muted-foreground">{t('raceTargetNote')}</p>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            reset();
          }}
          placeholder={t('raceTargetPlaceholder')}
          maxLength={120}
          className="mt-2 w-full border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <SaveButton
          onClick={save}
          disabled={!dirty || status === 'saving'}
          pending={status === 'saving'}
          label={t('save')}
        />
        <SaveStatus status={status} t={t} />
      </div>
    </div>
  );
}

function CommunicationStyleField({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [draft, setDraft] = useState(value);
  const { status, reset, run } = useSaveStatus();
  const dirty = draft.trim() !== value.trim();

  const save = () => run(() => onSave(draft));

  return (
    <div>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('communicationStyleLabel')}
        </span>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          {t('communicationStyleNote')}
        </p>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            reset();
          }}
          placeholder={t('communicationStylePlaceholder')}
          rows={3}
          maxLength={300}
          className="mt-2 w-full resize-none border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <SaveButton
          onClick={save}
          disabled={!dirty || status === 'saving' || draft.trim().length === 0}
          pending={status === 'saving'}
          label={t('save')}
        />
        <SaveStatus status={status} t={t} />
      </div>
    </div>
  );
}

function WeeklySessionDayField({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (day: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [current, setCurrent] = useState(value);
  const { pending, error, run } = useSave();
  const options = [...DAYS, 'Flexible'];

  async function choose(day: string) {
    if (day === current) return;
    if (await run(() => onSave(day))) setCurrent(day);
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('weeklySessionDayLabel')}
      </p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {t('weeklySessionDayNote')}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((day, i) => (
          <DayTile
            key={day}
            label={day === 'Flexible' ? t('optFlexible') : t(DAY_KEYS[i])}
            selected={current === day}
            onClick={() => choose(day)}
            disabled={pending}
          />
        ))}
      </div>
      {error && <FieldError message={t('error')} />}
    </div>
  );
}

function FixedConstraintsField({
  value,
  onAdd,
  onRemove,
}: {
  value: string[];
  onAdd: (day: string) => Promise<SettingsActionResult>;
  onRemove: (day: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [current, setCurrent] = useState(value);
  const { pending, error, run } = useSave();

  async function toggle(day: string) {
    const isSet = current.includes(day);
    const ok = await run(() => (isSet ? onRemove(day) : onAdd(day)));
    if (ok) setCurrent((prev) => (isSet ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('fixedConstraintsLabel')}
      </p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {t('fixedConstraintsNote')}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {DAYS.map((day, i) => (
          <DayTile
            key={day}
            label={t(DAY_KEYS[i])}
            selected={current.includes(day)}
            onClick={() => toggle(day)}
            disabled={pending}
          />
        ))}
      </div>
      {error && <FieldError message={t('error')} />}
    </div>
  );
}

function SharingSection({
  link,
  onSetLinkVisibility,
  onSeverCoachingLink,
}: {
  link: SettingsCoachingLink;
  onSetLinkVisibility: (
    section: 'shareAthleteReports' | 'shareAiTranscripts',
    on: boolean,
  ) => Promise<SettingsActionResult>;
  onSeverCoachingLink: () => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [severed, setSevered] = useState(false);

  if (severed) {
    return (
      <Section label={t('sectionSharing')}>
        <p className="font-body text-sm text-foreground">{t('severed')}</p>
      </Section>
    );
  }

  return (
    <Section label={t('sectionSharing')}>
      <p className="font-body text-sm text-foreground">
        {t('sharingIntro', { name: link.headCoachName })}
      </p>

      <div className="border border-border bg-background/60 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('sharingAlwaysOnTitle')}
        </p>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          {t('sharingAlwaysOnNote')}
        </p>
      </div>

      <VisibilityToggle
        label={t('sharingReportsLabel')}
        note={t('sharingReportsNote')}
        section="shareAthleteReports"
        value={link.shareAthleteReports}
        onSetLinkVisibility={onSetLinkVisibility}
      />
      <VisibilityToggle
        label={t('sharingTranscriptsLabel')}
        note={t('sharingTranscriptsNote')}
        section="shareAiTranscripts"
        value={link.shareAiTranscripts}
        onSetLinkVisibility={onSetLinkVisibility}
      />

      <SeverControl
        headCoachName={link.headCoachName}
        onSeverCoachingLink={onSeverCoachingLink}
        onSevered={() => setSevered(true)}
      />
    </Section>
  );
}

function VisibilityToggle({
  label,
  note,
  section,
  value,
  onSetLinkVisibility,
}: {
  label: string;
  note: string;
  section: 'shareAthleteReports' | 'shareAiTranscripts';
  value: boolean;
  onSetLinkVisibility: (
    section: 'shareAthleteReports' | 'shareAiTranscripts',
    on: boolean,
  ) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [on, setOn] = useState(value);
  const { pending, error, run } = useSave();

  async function flip() {
    const next = !on;
    if (await run(() => onSetLinkVisibility(section, next))) setOn(next);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-body text-sm text-foreground">{label}</p>
        <p className="mt-0.5 font-body text-xs text-muted-foreground">{note}</p>
        {error && <FieldError message={t('error')} />}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={pending}
        onClick={flip}
        className={[
          'relative h-6 w-11 shrink-0 border transition-colors disabled:opacity-50',
          on ? 'border-signal bg-signal' : 'border-border bg-muted',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-4 w-4 bg-background transition-transform',
            on ? 'translate-x-[22px]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

function SeverControl({
  headCoachName,
  onSeverCoachingLink,
  onSevered,
}: {
  headCoachName: string;
  onSeverCoachingLink: () => Promise<SettingsActionResult>;
  onSevered: () => void;
}) {
  const t = useTranslations('Settings');
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useSave();

  async function confirmSever() {
    if (await run(onSeverCoachingLink)) onSevered();
  }

  if (!confirming) {
    return (
      <div className="border-t border-rule pt-4">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-destructive transition-opacity hover:opacity-80"
        >
          {t('severLink')}
        </button>
      </div>
    );
  }

  return (
    <div className="border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-body text-sm text-foreground">
        {t('severConfirmTitle', { name: headCoachName })}
      </p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {t('severConfirmBody', { name: headCoachName })}
      </p>
      {error && <FieldError message={t('error')} />}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={confirmSever}
          disabled={pending}
          className="inline-flex items-center gap-2 border border-destructive px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('severConfirmButton')}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('severCancel')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Your data                                                          */
/* ------------------------------------------------------------------ */

/**
 * Export and erasure (`showable-version/10`; `docs/nfr.md` PRIV-3).
 *
 * Last section on the page, and unconditional — unlike Sharing, this is not
 * something only some athletes have. Settings is the conventional home for
 * account actions and the Privacy view links here rather than holding the
 * controls itself: that view explains the rights, this one exercises them.
 */
function YourDataSection({
  email,
  onDeleteAccount,
}: {
  email: string;
  onDeleteAccount: (confirmation: string) => Promise<DeleteAccountResult>;
}) {
  const t = useTranslations('Settings');

  return (
    <Section label={t('sectionYourData')}>
      <div>
        <p className="font-body text-sm text-foreground">{t('exportLabel')}</p>
        <p className="mt-1 font-body text-xs text-muted-foreground">{t('exportNote')}</p>
        {/*
          A plain anchor, not the i18n Link: the route lives outside the
          `[locale]` segment and must not be locale-prefixed. `download` asks the
          browser to save rather than navigate; the Content-Disposition header on
          the route is what actually names the file.
        */}
        <a
          href="/api/export"
          download
          className="mt-3 inline-flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition-colors hover:border-signal hover:text-signal"
        >
          <Download className="h-3 w-3" />
          {t('exportButton')}
        </a>
      </div>

      <div className="border-t border-rule pt-5">
        <p className="font-body text-sm text-foreground">{t('deleteLabel')}</p>
        <p className="mt-1 font-body text-xs text-muted-foreground">{t('deleteNote')}</p>
        <DeleteAccountControl email={email} onDeleteAccount={onDeleteAccount} />
      </div>
    </Section>
  );
}

/**
 * The confirmation gate on an irreversible delete.
 *
 * Type-to-confirm rather than a plain two-button "are you sure" (decided
 * 2026-08-27). The deletion is immediate and hard — there is no window, no undo
 * and no backup — so this dialog is the only thing between a misclick and the
 * loss of an athlete's entire record. Every other destructive-looking action in
 * this app is recoverable by doing it again; this one is not, and two clicks in
 * the same corner of the screen is not a proportionate gate for it.
 *
 * The disabled button is a hint, not the control: `deleteMyAccountAction`
 * re-checks the typed value against the session's own email server-side.
 *
 * The export is offered here as a **link**, not a checkbox on the delete. A
 * checkbox would chain the download to the deletion, and if the browser blocked
 * it or it failed, the data would be gone and the copy would never have arrived.
 * A link means the file is in hand before anything destructive runs.
 */
function DeleteAccountControl({
  email,
  onDeleteAccount,
}: {
  email: string;
  onDeleteAccount: (confirmation: string) => Promise<DeleteAccountResult>;
}) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const { pending, error, run } = useSave();

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function confirmDelete() {
    if (!matches) return;
    if (await run(() => onDeleteAccount(typed))) {
      // The session rows went with the user row, so there is nobody to be any
      // more. Leave immediately rather than sitting on a page whose data no
      // longer exists.
      router.replace('/sign-in');
      router.refresh();
    }
  }

  if (!confirming) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-destructive transition-opacity hover:opacity-80"
        >
          {t('deleteButton')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-body text-sm text-foreground">{t('deleteConfirmTitle')}</p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {t('deleteConfirmBody')}
      </p>
      <p className="mt-2 font-body text-xs text-destructive">
        {t('deleteConfirmIrreversible')}
      </p>

      <a
        href="/api/export"
        download
        className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground underline transition-colors hover:text-signal"
      >
        <Download className="h-3 w-3" />
        {t('deleteConfirmDownloadFirst')}
      </a>

      <label
        htmlFor="delete-confirm"
        className="mt-4 block font-body text-xs text-muted-foreground"
      >
        {t('deleteConfirmTypePrompt', { email })}
      </label>
      <input
        id="delete-confirm"
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={pending}
        autoComplete="off"
        placeholder={t('deleteConfirmPlaceholder')}
        className="mt-1 w-full max-w-sm border border-border bg-panel px-3 py-2 font-body text-sm text-foreground outline-none focus:border-destructive"
      />

      {error && <FieldError message={t('deleteError')} />}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={confirmDelete}
          disabled={pending || !matches}
          className="inline-flex items-center gap-2 border border-destructive px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('deleteConfirmButton')}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped('');
          }}
          disabled={pending}
          className="border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('deleteCancel')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

function DayTile({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'flex items-center gap-1.5 border px-3 py-1.5 font-body text-sm transition-colors disabled:opacity-50',
        selected
          ? 'border-signal bg-signal/5 text-foreground'
          : 'border-border bg-panel text-muted-foreground hover:border-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {selected && <Check className="h-3.5 w-3.5 text-signal" aria-hidden="true" />}
      {label}
    </button>
  );
}

function SaveButton({
  onClick,
  disabled,
  pending,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 border border-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}

function SaveStatus({
  status,
  t,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === 'saving') {
    return <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t('saving')}</span>;
  }
  if (status === 'saved') {
    return <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">{t('saved')}</span>;
  }
  if (status === 'error') {
    return <FieldError message={t('error')} />;
  }
  return null;
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-destructive">
      {message}
    </p>
  );
}
