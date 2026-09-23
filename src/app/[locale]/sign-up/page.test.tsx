import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * showable-version/04: registration is closed for the tester round, so the
 * sign-up route must not hand a tester a form that cannot work. It redirects
 * while `DISABLE_SIGNUP` is set, and comes back by itself when it is not.
 */
const redirect = vi.fn(() => {
  throw new Error('REDIRECT');
});
vi.mock('@/i18n/navigation', () => ({ redirect }));
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('../auth-form', () => ({ AuthForm: vi.fn(() => null) }));

const SignUpPage = (await import('./page')).default;
const { AuthForm } = await import('../auth-form');

describe('the sign-up route while registration is closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_SIGNUP;
  });

  it('sends a tester to sign-in rather than rendering a form that will be refused', async () => {
    process.env.DISABLE_SIGNUP = 'true';
    await expect(SignUpPage({ params: Promise.resolve({ locale: 'da' }) })).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    expect(AuthForm).not.toHaveBeenCalled();
  });

  it('renders the form when registration is open', async () => {
    await SignUpPage({ params: Promise.resolve({ locale: 'en' }) });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('is closed only by the exact value better-auth reads', async () => {
    // `auth.ts` gates on `=== 'true'`; anything else leaves signup open, and
    // the page must not disagree with the server about which it is.
    process.env.DISABLE_SIGNUP = 'false';
    await SignUpPage({ params: Promise.resolve({ locale: 'en' }) });
    expect(redirect).not.toHaveBeenCalled();
  });
});
