import { requireSession } from "@/lib/auth/session";
import { listAlerts } from "@/lib/data/queries";
import { AppNav } from "@/components/shell/app-nav";

/**
 * The authenticated shell.
 *
 * `requireSession()` is the second guard after middleware — a page under this
 * layout cannot render without a session even if the matcher ever misses.
 * Every child route therefore gets the session for free.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const alerts = await listAlerts(session.workspaceId);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col lg:flex-row">
      <AppNav session={session} attentionCount={alerts.length} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
