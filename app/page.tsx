import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

/**
 * Forge is an application, not a marketing site — the root is an entry point.
 * Middleware normally handles this redirect; this page is the fallback for any
 * request that reaches the root without passing through it.
 */
export default async function RootPage() {
  const session = await getSession();
  redirect(session ? "/home" : "/login");
}
