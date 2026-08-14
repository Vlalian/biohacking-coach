'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Check, Loader2, LogOut, Moon, Sun, SunMoon } from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ONBOARDING_OPTIONS } from '@/features/onboarding/onboarding-flow';
import type { SettingsActionResult } from './settings-actions';

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
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
    setPending(true);
    setError(false);
    const result = await onUpdateLanguage(next);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    router.replace(pathname, { locale: next });
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
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = draft.trim() !== value.trim();

  async function save() {
    setStatus('saving');
    const result = await onSave(draft);
    setStatus(result.ok ? 'saved' : 'error');
  }

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
            setStatus('idle');
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
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = draft.trim() !== value.trim();

  async function save() {
    setStatus('saving');
    const result = await onSave(draft);
    setStatus(result.ok ? 'saved' : 'error');
  }

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
            setStatus('idle');
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const options = [...DAYS, 'Flexible'];

  async function choose(day: string) {
    if (day === current) return;
    setPending(true);
    setError(false);
    const result = await onSave(day);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setCurrent(day);
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function toggle(day: string) {
    setPending(true);
    setError(false);
    const isSet = current.includes(day);
    const result = isSet ? await onRemove(day) : await onAdd(day);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setCurrent((prev) => (isSet ? prev.filter((d) => d !== day) : [...prev, day]));
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function flip() {
    const next = !on;
    setPending(true);
    setError(false);
    const result = await onSetLinkVisibility(section, next);
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setOn(next);
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function confirmSever() {
    setPending(true);
    setError(false);
    const result = await onSeverCoachingLink();
    setPending(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    onSevered();
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
