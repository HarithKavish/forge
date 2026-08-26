/**
 * Provider catalogue.
 *
 * Two kinds of entry, and the difference is visible in the UI rather than
 * glossed over: providers with a registered adapter can actually be connected;
 * the rest are planned, and say so.
 *
 * `capabilities` for an implemented provider comes from the adapter itself, so
 * the catalogue cannot drift from what the code can really do.
 */

import { getAdapter } from "./registry";
import type { ProviderCapabilities } from "./types";

/** One input on the connect form. Declared here so the form stays generic. */
export interface CredentialField {
  name: string;
  label: string;
  /** Rendered as a password input and never echoed back to the browser. */
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface ProviderInfo {
  id: string;
  displayName: string;
  category: "cloud" | "source" | "database" | "edge" | "platform";
  summary: string;
  capabilities: ProviderCapabilities;
  /** What Forge asks for when connecting. */
  credentialKind: string;
  consoleUrl: string;
  /** True when an adapter is registered and the provider can be connected. */
  implemented: boolean;
  /** How a connection is established. */
  connectMethod: "oauth" | "token";
  /** Where to create the credential, for the connect page to link to. */
  credentialUrl?: string;
  credentialFields?: CredentialField[];
  /** Read-only permissions the credential should be given, in the provider's own words. */
  requiredScopes?: string[];
  /** Anything the user should know before granting. Shown, not buried. */
  caveat?: string;
}

interface CatalogueEntry {
  id: string;
  displayName: string;
  category: ProviderInfo["category"];
  summary: string;
  credentialKind: string;
  consoleUrl: string;
  connectMethod: "oauth" | "token";
  credentialUrl?: string;
  credentialFields?: CredentialField[];
  requiredScopes?: string[];
  caveat?: string;
}

const ENTRIES: CatalogueEntry[] = [
  {
    id: "github",
    displayName: "GitHub",
    category: "source",
    summary: "Repositories, visibility, and commit activity.",
    credentialKind: "OAuth — you authorise Forge, no token to paste",
    consoleUrl: "https://github.com",
    connectMethod: "oauth",
    requiredScopes: ["repo", "read:org", "read:user"],
    caveat:
      "GitHub's OAuth Apps have no read-only variant of `repo`, so the grant includes write access even though Forge only ever issues GET requests.",
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare",
    category: "edge",
    summary: "Zones, Workers, R2 buckets and Pages projects.",
    credentialKind: "API token, scoped read-only",
    consoleUrl: "https://dash.cloudflare.com",
    connectMethod: "token",
    credentialUrl: "https://dash.cloudflare.com/profile/api-tokens",
    requiredScopes: [
      "Account | Account Settings | Read",
      "Zone | Zone | Read",
      "Account | Workers Scripts | Read",
      "Account | Workers R2 Storage | Read",
      "Account | Cloudflare Pages | Read",
    ],
    caveat:
      "Cloudflare's tokens are genuinely fine-grained, so this connection can be read-only. Grant only the products you want discovered — Forge skips the ones the token cannot see rather than failing.",
    credentialFields: [
      {
        name: "apiToken",
        label: "API token",
        secret: true,
        required: true,
        placeholder: "40-character token",
        help: "Create a custom token with the read permissions listed above.",
      },
      {
        name: "accountId",
        label: "Account ID",
        secret: false,
        required: false,
        placeholder: "Optional",
        help: "Only needed if the token can see more than one account. Forge uses the first otherwise.",
      },
    ],
  },
  {
    id: "vercel",
    displayName: "Vercel",
    category: "platform",
    summary: "Projects, production deployments and domains.",
    credentialKind: "Access token",
    consoleUrl: "https://vercel.com/dashboard",
    connectMethod: "token",
    credentialUrl: "https://vercel.com/account/tokens",
    requiredScopes: ["Read access to the account or team you want discovered"],
    caveat:
      "Vercel tokens are not scope-limited — a token carries the same rights you have. Set the shortest expiry you can live with, and scope it to one team rather than your whole account where possible.",
    credentialFields: [
      {
        name: "accessToken",
        label: "Access token",
        secret: true,
        required: true,
        placeholder: "vercel_...",
        help: "Account Settings → Tokens → Create.",
      },
      {
        name: "teamId",
        label: "Team ID",
        secret: false,
        required: false,
        placeholder: "Optional — team_...",
        help: "Required to see a team's projects. Leave empty for a personal account.",
      },
    ],
  },
  {
    id: "neon",
    displayName: "Neon",
    category: "database",
    summary: "Postgres projects, branches and compute endpoints.",
    credentialKind: "API key",
    consoleUrl: "https://console.neon.tech",
    connectMethod: "token",
    credentialUrl: "https://console.neon.tech/app/settings/api-keys",
    requiredScopes: ["Personal or organisation API key"],
    caveat:
      "Neon API keys are not scope-limited — the key carries your own rights. Forge only issues GET requests, but the key itself can do more, so treat it accordingly.",
    credentialFields: [
      {
        name: "apiKey",
        label: "API key",
        secret: true,
        required: true,
        placeholder: "napi_...",
        help: "Console → Account settings → API keys → Create new.",
      },
    ],
  },
];

function toProviderInfo(entry: CatalogueEntry): ProviderInfo {
  // Every catalogue entry has a registered adapter — a provider Forge cannot
  // actually connect to has no business being listed.
  const adapter = getAdapter(entry.id);
  if (!adapter) {
    throw new Error(
      `Catalogue lists "${entry.id}" but no adapter is registered for it.`,
    );
  }
  return {
    id: entry.id,
    displayName: entry.displayName,
    category: entry.category,
    summary: entry.summary,
    credentialKind: entry.credentialKind,
    consoleUrl: entry.consoleUrl,
    implemented: true,
    connectMethod: entry.connectMethod,
    credentialUrl: entry.credentialUrl,
    credentialFields: entry.credentialFields,
    requiredScopes: entry.requiredScopes,
    caveat: entry.caveat,
    // The adapter is the authority on its own capabilities, so the catalogue
    // cannot drift from what the code can really do.
    capabilities: adapter.capabilities,
  };
}

export const PROVIDERS: ProviderInfo[] = ENTRIES.map(toProviderInfo);

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderInfo | undefined {
  return BY_ID.get(id);
}

/** Display name for a provider slug, falling back to the slug itself. */
export function providerName(id: string): string {
  return BY_ID.get(id)?.displayName ?? id;
}
