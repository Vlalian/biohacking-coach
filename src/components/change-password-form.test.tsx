import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `Settings.${key}`,
}));
const changePassword = vi.fn();
vi.mock('@/lib/auth-client', () => ({ authClient: { changePassword } }));

const { ChangePasswordForm, submitPasswordChange } = await import('./change-password-form');

/**
 * showable-version/04: a tester's welcome email carries their password and is
 * filed with it, so the first thing they can do is change it. The suite has
 * no DOM, so the markup is pinned statically and the submit rule is a plain
 * function the form calls — the click-through is `/preview`'s.
 */
describe('ChangePasswordForm', () => {
  it('offers current, new and confirm fields and one submit', () => {
    const html = renderToStaticMarkup(<ChangePasswordForm />);
    expect(html).toMatch(/<form[^>]*data-change-password/);
    for (const name of ['currentPassword', 'newPassword', 'confirmPassword']) {
      const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*/>`))?.[0];
      expect(input).toContain('type="password"');
    }
    expect(html).toContain('Settings.changePassword');
    expect(html).not.toContain('Settings.passwordChanged');
    expect(html).not.toContain('Settings.passwordMismatch');
  });
});

describe('submitPasswordChange', () => {
  beforeEach(() => changePassword.mockReset());

  it('refuses a confirm that does not match and never calls the server', async () => {
    const outcome = await submitPasswordChange({
      currentPassword: 'old-pass-123',
      newPassword: 'abcdefgh1',
      confirmPassword: 'abcdefgh2',
    });
    expect(outcome).toBe('mismatch');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('refuses a new password under eight characters before any request', async () => {
    const outcome = await submitPasswordChange({
      currentPassword: 'old-pass-123',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    expect(outcome).toBe('tooShort');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and revokes other sessions', async () => {
    changePassword.mockResolvedValue({ data: {}, error: null });
    const outcome = await submitPasswordChange({
      currentPassword: 'old-pass-123',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    });
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-pass-123',
      newPassword: 'new-pass-123',
      revokeOtherSessions: true,
    });
    expect(outcome).toBe('changed');
  });

  it('reports a refused change generically, whatever the server said', async () => {
    changePassword.mockResolvedValue({ data: null, error: { message: 'Invalid password' } });
    const change = { currentPassword: 'x'.repeat(8), newPassword: 'y'.repeat(8), confirmPassword: 'y'.repeat(8) };
    expect(await submitPasswordChange(change)).toBe('failed');
  });

  it('reports a thrown request as the same generic failure', async () => {
    changePassword.mockRejectedValueOnce(new Error('network'));
    const change = { currentPassword: 'x'.repeat(8), newPassword: 'y'.repeat(8), confirmPassword: 'y'.repeat(8) };
    expect(await submitPasswordChange(change)).toBe('failed');
  });
});
