/**
 * Shared HTTP for token-authenticated providers.
 *
 * Every adapter has to map transport failures onto Forge's error types the same
 * way, because the distinction drives real behaviour: an auth error marks the
 * account `needs_reauth` and stops retrying, while a transient one is retried
 * and must never let a sync conclude that resources were deleted.
 *
 * Doing that once here keeps three adapters from each getting it slightly
 * wrong.
 */

import {
  ProviderAuthError,
  ProviderPermissionError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from "./errors";

export interface ProviderRequest {
  provider: string;
  url: string;
  token: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Overrides the default "Bearer <token>". */
  authorization?: string;
}

export async function providerFetch(request: ProviderRequest): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(request.url, {
      headers: {
        Authorization: request.authorization ?? `Bearer ${request.token}`,
        Accept: "application/json",
        "User-Agent": "Forge (forge.harithkavish.com)",
        ...request.headers,
      },
      signal: request.signal,
      cache: "no-store",
    });
  } catch (cause) {
    // Network-level failure. Retryable, and never to be read as "the resources
    // are gone".
    throw new ProviderUnavailableError(
      "Could not reach the provider API.",
      request.provider,
      cause,
    );
  }

  if (response.ok) return response;

  if (response.status === 401) {
    throw new ProviderAuthError(
      "The stored credential was rejected. It may have been revoked or expired.",
      request.provider,
    );
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    throw new ProviderRateLimitError(
      "Rate limit reached.",
      request.provider,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  if (response.status === 403) {
    throw new ProviderPermissionError(
      "The credential is valid but lacks a permission this request needs.",
      request.provider,
    );
  }

  // 5xx and anything unexpected: retryable, and non-destructive by definition.
  throw new ProviderUnavailableError(
    `The provider returned ${response.status}.`,
    request.provider,
  );
}

export async function providerJson<T>(request: ProviderRequest): Promise<T> {
  const response = await providerFetch(request);
  return (await response.json()) as T;
}

/** Cloudflare-style envelope: `{ success, errors, result, result_info }`. */
export interface CloudflareEnvelope<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

/**
 * Cloudflare answers 200 with `success: false` for some failures, so the status
 * code alone is not enough to tell whether a call worked.
 */
export function unwrapCloudflare<T>(
  payload: CloudflareEnvelope<T>,
  provider: string,
): T {
  if (!payload.success) {
    const message = payload.errors?.[0]?.message ?? "The request was rejected.";
    // 10000 is Cloudflare's "authentication error" family.
    if (payload.errors?.some((e) => e.code === 10000)) {
      throw new ProviderAuthError(message, provider);
    }
    throw new ProviderUnavailableError(message, provider);
  }
  return payload.result;
}
