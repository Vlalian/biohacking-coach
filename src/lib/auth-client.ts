import { createAuthClient } from 'better-auth/react';

/**
 * The browser-side auth handle.
 *
 * baseURL is inferred from the current origin, which is what we want: the
 * client talks to the same deployment it was served from. The route handler at
 * /api/auth/[...all] is the other end.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
