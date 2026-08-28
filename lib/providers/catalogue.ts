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
  /**
   * True when this deployment has the credentials the flow needs.
   *
   * An adapter can exist while the operator has not registered an app with the
   * provider yet — offering Connect then would dead-end on the start route.
   */
  configured: boolean;
  /** Env vars an operator must set. Shown to signed-in users, never secrets. */
  requiredEnv?: string[];
  /** How a connection is established. */
  connectMethod: "oauth" | "token";
  /** Where to create the credential, for the connect page to link to. */
  credentialUrl?: string;
  credentialFields?: CredentialField[];
  /** Read-only permissions the credential should be given, in the provider's own words. */
  requiredScopes?: string[];
  /** Where the connect page sends the user to begin an OAuth flow. */
  oauthStartPath?: string;
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
  oauthStartPath?: string;
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
    oauthStartPath: "/api/integrations/github/start",
    requiredScopes: ["repo", "read:org", "read:user"],
    caveat:
      "GitHub's OAuth Apps have no read-only variant of `repo`, so the grant includes write access even though Forge only ever issues GET requests. A GitHub App would allow read-only; this deployment uses an OAuth App deliberately.",
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare",
    category: "edge",
    summary: "Zones, Workers, R2 buckets and Pages projects.",
    credentialKind: "OAuth — you authorise Forge, no token to paste",
    consoleUrl: "https://dash.cloudflare.com",
    connectMethod: "oauth",
    oauthStartPath: "/api/integrations/cloudflare/start",
    requiredScopes: [
      "Account Settings: Read",
      "Zone: Read",
      "Workers Scripts: Read",
      "Workers R2 Storage: Read",
      "Cloudflare Pages: Read",
    ],
    caveat:
      "Cloudflare's scopes are genuinely fine-grained, so this connection is properly read-only — Forge is granted exactly what it uses and nothing more. You choose which account to grant on the consent screen.",
  },
  {
    id: "vercel",
    displayName: "Vercel",
    category: "platform",
    summary: "Projects, production deployments and domains.",
    credentialKind: "OAuth — you install the Forge integration, no token to paste",
    consoleUrl: "https://vercel.com/dashboard",
    connectMethod: "oauth",
    oauthStartPath: "/api/integrations/vercel/start",
    requiredScopes: [
      "Projects: Read",
      "Deployments: Read",
      "Domains: Read",
    ],
    caveat:
      "You choose whether to install against your personal account or a specific team, and the connection only ever sees what you picked. Permissions are read-only.",
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
      "Neon's OAuth is limited to approved partners, so each person connects with their own API key. Keys are not scope-limited — the key carries your own rights. Forge only issues GET requests, but the key itself can do more.",
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

/**
 * Env each provider's connect flow needs. Names only — never values.
 *
 * Read per call rather than at module load: Next evaluates module scope during
 * the build, where none of these exist, which would bake in "not configured".
 */
const REQUIRED_ENV: Record<string, string[]> = {
  github: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
  cloudflare: ["CLOUDFLARE_OAUTH_CLIENT_ID", "CLOUDFLARE_OAUTH_CLIENT_SECRET"],
  vercel: [
    "VERCEL_OAUTH_CLIENT_ID",
    "VERCEL_OAUTH_CLIENT_SECRET",
    "VERCEL_INTEGRATION_SLUG",
  ],
  // Token entry needs nothing server-side; the user supplies the credential.
  neon: [],
};

/** Which of a provider's required env vars are missing from this deployment. */
export function missingEnvFor(providerId: string): string[] {
  return (REQUIRED_ENV[providerId] ?? []).filter((name) => !process.env[name]);
}

export function providerConfigured(providerId: string): boolean {
  return missingEnvFor(providerId).length === 0;
}

function toProviderInfo(entry: CatalogueEntry): ProviderInfo {
  // Every catalogue entry has a registered adapter — a provider Forge cannot
  // actually connect to has no business being listed.
  const adapter = getAdapter(entry.id);
  if (!adapter) {
    throw new Error(
      `Catalogue lists "${entry.id}" but no adapter is registered for it.`,
    );
  }

  // Spread rather than copying field by field. The hand-written version
  // silently dropped `oauthStartPath` when it was added, which showed up as a
  // missing button rather than an error — the whole class of bug is avoided by
  // not restating the field list here.
  return {
    ...entry,
    implemented: true,
    configured: providerConfigured(entry.id),
    requiredEnv: REQUIRED_ENV[entry.id],
    // The adapter is the authority on its own capabilities, so the catalogue
    // cannot drift from what the code can really do.
    capabilities: adapter.capabilities,
  };
}

/**
 * Built per call, not cached, because `configured` depends on the environment
 * at request time rather than at module load.
 */
export function listProviderInfo(): ProviderInfo[] {
  return ENTRIES.map(toProviderInfo);
}

export function getProvider(id: string): ProviderInfo | undefined {
  const entry = ENTRIES.find((e) => e.id === id);
  return entry ? toProviderInfo(entry) : undefined;
}

/** Display name for a provider slug, falling back to the slug itself. */
export function providerName(id: string): string {
  return ENTRIES.find((e) => e.id === id)?.displayName ?? id;
}
