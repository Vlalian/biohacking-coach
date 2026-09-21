import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `PreferredName.${key}`,
}));

const { PreferredNameField } = await import('./preferred-name-field');

/**
 * What a static render can pin (the suite runs without a DOM): the field is
 * empty by default and nothing about the account name is prefilled or shown,
 * and the warning is not on screen until a commit trips it. The warning rule
 * itself is `matchesAccountName`, tested in `preferred-name.test.ts`; the
 * click-through is exercised by hand (`/preview`).
 */
describe('PreferredNameField', () => {
  it('renders empty, with no trace of the account name, and no warning', () => {
    const html = renderToStaticMarkup(
      <PreferredNameField
        accountName="Mads Kilstrup"
        onCommit={() => {}}
        actions={(commit) => (
          <button type="button" onClick={() => commit('')}>
            go
          </button>
        )}
      />,
    );
    expect(html).toContain('value=""');
    expect(html).not.toContain('Mads');
    expect(html).not.toContain('Kilstrup');
    expect(html).not.toContain('PreferredName.realNameWarning');
    expect(html).toContain('PreferredName.placeholder');
    expect(html).toContain('>go<');
  });

  it('shows the stored value in Settings without changing the rule', () => {
    const html = renderToStaticMarkup(
      <PreferredNameField
        accountName="Mads Kilstrup"
        initialValue="Captain"
        onCommit={() => {}}
        actions={() => null}
      />,
    );
    expect(html).toContain('value="Captain"');
    expect(html).toMatch(/maxlength="40"/i);
  });
});
