import { describe, it, expect, vi } from 'vitest';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./garmin-actions', () => ({}));
vi.mock('./garmin-blob-upload', () => ({}));

const { ERROR_KEY } = await import('./garmin-upload');

/** `garmin-integration/04`, ruling 6a — the calendar upload refuses a big file and says where it goes instead. */
describe('a detection file over the cap', () => {
  it('is refused by the server with the same message the browser shows', () => {
    expect(ERROR_KEY['too-large']).toBe('errorTooLarge');
  });

  it('names 50 MB and points to the history upload in Settings, in English and Danish', () => {
    expect(en.Garmin.errorTooLarge).toContain('50 MB');
    expect(en.Garmin.errorTooLarge).toContain('Settings → Training → Training history');
    expect(da.Garmin.errorTooLarge).toContain('50 MB');
    expect(da.Garmin.errorTooLarge).toContain('Indstillinger → Træning → Træningshistorik');
  });
});
