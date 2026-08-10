import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Provider SDKs are server-only. Anything that touches credentials must never
  // be reachable from a client bundle; see docs/ARCHITECTURE.md §Security.
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default nextConfig;
