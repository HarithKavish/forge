/**
 * Auth.js route handler.
 *
 * This file's location defines the OAuth callback URL that must be registered
 * with Google:
 *
 *   https://forge.harithkavish.com/api/auth/callback/google
 *
 * Moving this route changes that URL, which would break sign-in until Google
 * Cloud is updated to match. See docs/AUTH.md.
 */

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
