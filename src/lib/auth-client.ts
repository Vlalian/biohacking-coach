import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

/**
 * The browser-side auth handle.
 *
 * baseURL is inferred from the current origin, which is what we want: the
 * client talks to the same deployment it was served from. The route handler at
 * /api/auth/[...all] is the other end.
 */
// adminClient mirrors the server's admin plugin (auth.ts) so `authClient.admin.*`
// — impersonate, listUsers, setRole, ban — exists and is typed on the browser side.
export const authClient = createAuthClient({ plugins: [adminClient()] });

export const { signIn, signUp, signOut, useSession } = authClient;
