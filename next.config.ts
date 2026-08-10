import type { NextConfig } from "next";

/**
 * Sent on every response. Forge is an application behind a session, never
 * something that should be framed by another origin or sniffed into a
 * different content type.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Provider SDKs and the database client are server-only. Nothing that touches
  // credentials may be reachable from a client bundle; see docs/ARCHITECTURE.md.
  serverExternalPackages: ["@neondatabase/serverless"],

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
