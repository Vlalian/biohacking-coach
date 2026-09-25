import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * showable-version/04: while registration is closed, the sign-in page must not
 * offer a way to a form that cannot work. The link is the only thing the flag
 * changes here — the form itself is untouched.
 */
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `Auth.${key}` }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/auth-client', () => ({ signIn: { email: vi.fn() }, signUp: { email: vi.fn() } }));

const { AuthForm } = await import('./auth-form');

describe('AuthForm', () => {
  it('offers the way to sign up when registration is open', () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-in" allowSignUp />);
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('Auth.toSignUp');
  });

  it('offers no way to sign up when registration is closed', () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-in" allowSignUp={false} />);
    expect(html).not.toContain('/sign-up');
    expect(html).not.toContain('Auth.toSignUp');
    // Everything a tester needs is still there.
    expect(html).toContain('Auth.signInButton');
  });

  it('keeps the way back to sign-in on the sign-up form itself', () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-up" allowSignUp />);
    expect(html).toContain('href="/sign-in"');
  });
});
