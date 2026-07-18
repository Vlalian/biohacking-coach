import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

// Every better-auth endpoint (sign-up, sign-in, sign-out, get-session) is served
// from here. This route is outside [locale] and the i18n middleware skips /api,
// so auth traffic is never locale-rewritten.
export const { GET, POST } = toNextJsHandler(auth);
