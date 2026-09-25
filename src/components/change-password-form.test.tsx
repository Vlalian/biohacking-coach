import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `Settings.${key}`,
}));
const changePassword = vi.fn();
vi.mock('@/lib/auth-client', () => ({ authClient: { changePassword } }));

const { ChangePasswordForm, messageKey, messageValues, submitPasswordChange } = await import(
  './change-password-form'
);

/**
 * showable-version/04: a tester's welcome email carries their password and is
 * filed with it, so the first thing they can do is change it. The suite has no
 * DOM, so the markup is pinned statically and the submit rule is a plain
 * function the form calls — the click-through is `/preview`'s.
 */
const account = { email: 'sarah@example.dk', name: 'Sarah Berg' };
const change = (over: Partial<Parameters<typeof submitPasswordChange>[0]> = {}) => ({
  currentPassword: 'old-pass-12345',
  newPassword: 'a long enough one',
  confirmPassword: 'a long enough one',
  ...account,
  ...over,
});

describe('ChangePasswordForm', () => {
  it('offers current, new and confirm fields and one submit', () => {
    const html = renderToStaticMarkup(<ChangePasswordForm {...account} />);
    expect(html).toMatch(/<form[^>]*data-change-password/);
    for (const name of ['currentPassword', 'newPassword', 'confirmPassword']) {
      const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*/>`))?.[0];
      expect(input).toContain('type="password"');
    }
    expect(html).toContain('Settings.changePassword');
    expect(html).not.toContain('Settings.passwordChanged');
    expect(html).not.toContain('Settings.passwordMismatch');
  });

  it('leaves length to the rules, so the message that appears is ours', () => {
    // `minLength` would block the submit with the browser's own bubble, in the
    // browser's language, and "needs 12 characters, you have 9" would never be
    // reached (CodeRabbit, PR #99).
    const html = renderToStaticMarkup(<ChangePasswordForm {...account} />);
    expect(html).not.toContain('minLength');
    expect(html.match(/required=""/g)).toHaveLength(3);
  });
});

describe('submitPasswordChange', () => {
  beforeEach(() => changePassword.mockReset());

  it('refuses a confirm that does not match and never calls the server', async () => {
    const result = await submitPasswordChange(change({ confirmPassword: 'something else' }));
    expect(result).toEqual({ outcome: 'mismatch' });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('refuses a password the rules refuse, naming which rule, before any request', async () => {
    expect(await submitPasswordChange(change({ newPassword: 'short', confirmPassword: 'short' }))).toEqual({
      outcome: 'refused',
      problem: 'tooShort',
      min: 12,
      actual: 5,
    });
    const own = { newPassword: 'sarah berg 2026', confirmPassword: 'sarah berg 2026' };
    expect(await submitPasswordChange(change(own))).toEqual({ outcome: 'refused', problem: 'personal' });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and revokes other sessions', async () => {
    changePassword.mockResolvedValue({ data: {}, error: null });
    expect(await submitPasswordChange(change())).toEqual({ outcome: 'changed' });
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-pass-12345',
      newPassword: 'a long enough one',
      revokeOtherSessions: true,
    });
  });

  it('reports a refused change generically, whatever the server said', async () => {
    changePassword.mockResolvedValue({ data: null, error: { message: 'Invalid password' } });
    expect(await submitPasswordChange(change())).toEqual({ outcome: 'failed' });
  });

  it('reports a thrown request as the same generic failure', async () => {
    changePassword.mockRejectedValueOnce(new Error('network'));
    expect(await submitPasswordChange(change())).toEqual({ outcome: 'failed' });
  });
});

describe('what the form says back', () => {
  it('names the rule that refused, with the numbers the message needs', () => {
    expect(messageKey({ outcome: 'refused', problem: 'tooShort', min: 12, actual: 9 })).toBe('passwordTooShort');
    expect(messageValues({ outcome: 'refused', problem: 'tooShort', min: 12, actual: 9 })).toEqual({
      min: 12,
      actual: 9,
    });
    expect(messageKey({ outcome: 'refused', problem: 'tooLong', max: 128 })).toBe('passwordTooLong');
    expect(messageValues({ outcome: 'refused', problem: 'tooLong', max: 128 })).toEqual({ max: 128 });
    expect(messageKey({ outcome: 'refused', problem: 'common' })).toBe('passwordTooCommon');
    expect(messageKey({ outcome: 'refused', problem: 'personal' })).toBe('passwordPersonal');
  });

  it('has a message for every other outcome, and no numbers to fill', () => {
    expect(messageKey({ outcome: 'changed' })).toBe('passwordChanged');
    expect(messageKey({ outcome: 'mismatch' })).toBe('passwordMismatch');
    expect(messageKey({ outcome: 'failed' })).toBe('passwordError');
    expect(messageValues({ outcome: 'changed' })).toEqual({});
  });
});
