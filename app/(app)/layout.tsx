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
      {/*
        Explicit z-20 wrapper, not relying on .site-sidebar's own stacking:
        Worldview's canvas renders position:fixed;inset:0 (world-canvas in
        globals.css) so it can sit behind the nav's translucent glass panel
        instead of being pushed into the leftover flex space next to it --
        the nav is sticky with z-index:auto, which without this wrapper
        would stack by DOM order (it comes before <main> in the tree, so a
        fixed descendant of <main> would paint over it).
      */}
      <div className="relative z-20 self-start lg:flex-none">
        <AppNav session={session} attentionCount={alerts.length} />
      </div>
      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <ContentFrame>{children}</ContentFrame>
      </main>
    </div>
  );
}
