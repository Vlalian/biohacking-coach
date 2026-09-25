import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./garmin-actions', () => ({}));
vi.mock('./garmin-blob-upload', () => ({}));

const { HistoryImportProgress, HistoryUpload } = await import('./history-upload');

/** `garmin-integration/04` — what the athlete sees of an upload and an import. */
describe('HistoryImportProgress', () => {
  it('the history screen shows import progress with the skipped-old count', () => {
    const html = renderToStaticMarkup(
      <HistoryImportProgress status={{ total: 1200, done: 340, skippedOld: 2100, failed: 0, status: 'importing' }} />,
    );
    expect(html).toContain('importing(done=340,total=1200)');
    expect(html).toContain('skippedOld(count=2100,weeks=8)');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('failedFiles');
  });

  it('says it is unpacking while the export is opened, with no count yet', () => {
    const html = renderToStaticMarkup(<HistoryImportProgress status={{ total: 40, done: 0, skippedOld: 0, failed: 0, status: 'unpacking' }} />);
    expect(html).toContain('unpacking()');
    expect(html).toContain('animate-spin');
    expect(html).not.toContain('importing(');
    expect(html).not.toContain('imported(');
  });

  it('says how many files were read once it is done, and how many would not read', () => {
    const html = renderToStaticMarkup(<HistoryImportProgress status={{ total: 12, done: 12, skippedOld: 0, failed: 2, status: 'done' }} />);
    expect(html).toContain('imported(done=12)');
    expect(html).toContain('failedFiles(count=2)');
    expect(html).not.toContain('importing(');
    expect(html).not.toContain('skippedOld');
  });
});

describe('HistoryUpload', () => {
  it('offers the picker for Garmin’s zip as well as single files, and names the window', () => {
    const html = renderToStaticMarkup(<HistoryUpload locked={false} importedCount={0} allowRemove={false} />);
    expect(html).toContain('accept=".fit,.gpx,.zip"');
    expect(html).toContain('multiple');
    expect(html).toContain('help(weeks=8)');
  });

  it('shows the count and the remove once an import is on file', () => {
    const html = renderToStaticMarkup(<HistoryUpload locked importedCount={42} allowRemove />);
    expect(html).toContain('locked(count=42)');
    expect(html).toContain('remove()');
    expect(html).not.toContain('type="file"');
  });
});
