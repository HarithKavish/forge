/**
 * Typed provider failures.
 *
 * The distinction matters operationally: an auth error should mark the account
 * `needs_reauth` and stop retrying, while a transient error should be retried
 * and must never cause Forge to conclude that resources were deleted.
 */

export abstract class ProviderError extends Error {
  abstract readonly retryable: boolean;

  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  /**
   * Safe for display and for `connected_accounts.last_sync_error`.
   * Subclasses must never fold a credential into the message.
   */
  toPublicMessage(): string {
    return this.message;
  }
}

/** Credentials are missing, wrong, expired, or revoked. Not retryable. */
export class ProviderAuthError extends ProviderError {
  readonly retryable = false;
}

/** Credentials are valid but lack the permission this call needs. */
export class ProviderPermissionError extends ProviderError {
  readonly retryable = false;

  constructor(
    message: string,
    provider: string,
    /** The permission/scope the provider said was missing, when it says. */
    readonly requiredPermission?: string,
    cause?: unknown,
  ) {
    super(message, provider, cause);
  }
}

/** Rate limited. Honour `retryAfterSeconds` when rescheduling the job. */
export class ProviderRateLimitError extends ProviderError {
  readonly retryable = true;

  constructor(
    message: string,
    provider: string,
    readonly retryAfterSeconds?: number,
    cause?: unknown,
  ) {
    super(message, provider, cause);
  }
}

/** Provider is unreachable or erroring. Retry; never treat as "resource gone". */
export class ProviderUnavailableError extends ProviderError {
  readonly retryable = true;
}

/** The adapter cannot do what was asked, e.g. cost on a provider without it. */
export class ProviderUnsupportedError extends ProviderError {
  readonly retryable = false;
}
