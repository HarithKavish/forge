/**
 * Provider marks.
 *
 * Short text codes rather than brand logos: reproducing a company's logo in a
 * demo would imply an integration that does not exist yet, and the codes stay
 * legible at the sizes the inventory table needs.
 */

import { providerName } from "@/lib/mock/providers";

const CODES: Record<string, string> = {
  github: "GH",
  aws: "AWS",
  "mongodb-atlas": "MDB",
  cloudflare: "CF",
  vercel: "VC",
  azure: "AZ",
  "oracle-cloud": "OCI",
};

export function ProviderMark({
  provider,
  size = "md",
}: {
  provider: string;
  size?: "sm" | "md" | "lg";
}) {
  const code = CODES[provider] ?? provider.slice(0, 2).toUpperCase();
  const dimension = { sm: "h-6 w-6 text-[0.6rem]", md: "h-8 w-8 text-[0.68rem]", lg: "h-11 w-11 text-[0.82rem]" }[size];

  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-[0.7rem] border border-border bg-surface-strong font-mono font-semibold tracking-tight text-muted ${dimension}`}
      title={providerName(provider)}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}

/** Mark plus name, the standard way a provider is identified in a row. */
export function ProviderLabel({
  provider,
  size = "sm",
}: {
  provider: string;
  size?: "sm" | "md";
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <ProviderMark provider={provider} size={size} />
      <span className="truncate">{providerName(provider)}</span>
    </span>
  );
}
