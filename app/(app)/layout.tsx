import { requireSession } from "@/lib/auth/session";
import { listAlerts } from "@/lib/data/queries";
import { AppNav } from "@/components/shell/app-nav";
import { ContentFrame } from "@/components/shell/content-frame";

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
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ContentFrame>{children}</ContentFrame>
      </main>
    </div>
  );
}
