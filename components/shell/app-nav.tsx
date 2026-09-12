"use client";

/**
 * Application navigation.
 *
 * One component drives both the desktop sidebar and the mobile drawer so the
 * two can never fall out of sync. The active item is derived from the pathname
 * and marked with `aria-current`, which is what both the styling and assistive
 * technology read.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/lib/auth/actions";
import { IdentitySync } from "@/components/ecosystem/identity-sync";
import { useEcosystemPicture } from "@/lib/ecosystem/use-picture";
import { SignOutButton } from "@/components/ecosystem/sign-out-button";
import type { ForgeSession } from "@/lib/auth/types";
import {
  AlertsIcon,
  ChevronRightIcon,
  CloseIcon,
  HomeIcon,
  IntegrationsIcon,
  MenuIcon,
  ProjectsIcon,
  ResourcesIcon,
  SettingsIcon,
  WorldviewIcon,
} from "@/components/ui/icons";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  label: string;
  href: string;
  icon: (props: { size?: number; className?: string }) => React.ReactElement;
  /** Badge count, shown only when non-zero. */
  badge?: number;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({
  items,
  pathname,
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  /** Icon only — label becomes the hover/a11y title instead. */
  collapsed?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className="nav-link relative"
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={17} className="flex-none" />
              {collapsed ? (
                <span className="sr-only">{item.label}</span>
              ) : (
                <span className="flex-1 truncate">{item.label}</span>
              )}
              {item.badge ? (
                collapsed ? (
                  // The full count doesn't fit a 72px rail — a dot still
                  // says "something needs attention" without overflowing it.
                  <>
                    <span
                      className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    <span className="sr-only">{item.badge} items need attention</span>
                  </>
                ) : (
                  <span className="pill pill--warning px-1.5 py-0 text-[0.68rem]">
                    {item.badge}
                    <span className="sr-only"> items need attention</span>
                  </span>
                )
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SessionPanel({
  session,
  collapsed = false,
}: {
  session: ForgeSession;
  collapsed?: boolean;
}) {
  // The shared value when there is one, so a picture changed on the account
  // site reaches this nav as quickly as it reaches every other surface.
  const picture = useEcosystemPicture(session.image);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {/* Tells the rest of the ecosystem who is here, so they stop asking. */}
      <IdentitySync name={session.name} image={session.image} />
      <div
        className={`flex min-w-0 items-center gap-2.5 px-1 ${collapsed ? "justify-center" : ""}`}
        title={collapsed ? session.name : undefined}
      >
        <span className="relative flex h-8 w-8 flex-none" aria-hidden="true">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={picture}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-strong text-[0.72rem] font-[650] text-muted">
              {session.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        {collapsed ? null : (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[0.86rem] font-[650]">{session.name}</span>
            {/* The handle, when the account has one. Never the account id:
                that is an internal identifier and means nothing to the
                person. */}
            {session.username ? (
              <span className="truncate text-[0.76rem] text-muted">@{session.username}</span>
            ) : null}
          </span>
        )}
      </div>

      <ThemeToggle compact={collapsed} />

      <form action={signOutAction}>
          <SignOutButton compact={collapsed} />
        </form>
    </div>
  );
}

export function AppNav({
  session,
  attentionCount,
}: {
  session: ForgeSession;
  attentionCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Forge-local, not the ecosystem HarithStore: no other surface has a
  // sidebar, so this preference has nothing to share across subdomains.
  // Read lazily on mount, not in useState's initializer, so the server
  // render and the client's first pass agree (localStorage doesn't exist
  // on the server) and hydration stays quiet.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("forge-sidebar-collapsed") === "true");
    } catch {
      // A blocked storage API only costs remembering the preference.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((was) => {
      const next = !was;
      try {
        localStorage.setItem("forge-sidebar-collapsed", String(next));
      } catch {
        // Same as above — the toggle itself still works this load.
      }
      return next;
    });
  }

  // A drawer that survives navigation would cover the page it just opened.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const primary: NavItem[] = [
    { label: "Home", href: "/home", icon: HomeIcon },
    { label: "Projects", href: "/projects", icon: ProjectsIcon },
    { label: "Resources", href: "/resources", icon: ResourcesIcon },
    { label: "Worldview", href: "/worldview", icon: WorldviewIcon },
    { label: "Integrations", href: "/integrations", icon: IntegrationsIcon },
    { label: "Alerts", href: "/alerts", icon: AlertsIcon, badge: attentionCount },
  ];

  const secondary: NavItem[] = [
    { label: "Settings", href: "/settings", icon: SettingsIcon },
  ];

  return (
    <>
      {/* Mobile chrome */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-(--chrome-bg) px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <Brand workspaceName={session.workspaceName} />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-drawer"
        >
          <MenuIcon size={18} />
          <span className="sr-only">Open navigation</span>
        </button>
      </header>

      {/* Desktop sidebar. .site-sidebar (design-system/css/sidebar.css)
          supplies the floating-pill frame — width, border, radius, shadow,
          backdrop-blur, sticky inset positioning, and the collapsed-width
          transition; `hidden lg:flex` still owns responsive show/hide,
          same breakpoint as the mobile header/drawer below. */}
      <aside
        className={`site-sidebar hidden lg:flex${collapsed ? " site-sidebar--collapsed" : ""}`}
      >
        <div className="site-sidebar__brand">
          <Brand workspaceName={session.workspaceName} compact={collapsed} />
        </div>
        <nav aria-label="Primary" className="site-sidebar__nav">
          <NavList items={primary} pathname={pathname} collapsed={collapsed} />
          {collapsed ? null : (
            <p className="eyebrow mt-6 mb-2 px-3 text-[0.68rem]">Workspace</p>
          )}
          <NavList items={secondary} pathname={pathname} collapsed={collapsed} />
        </nav>
        <div className="site-sidebar__footer">
          <SessionPanel session={session} collapsed={collapsed} />
          <button
            type="button"
            className="sidebar-collapse-toggle self-center"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronRightIcon size={16} className={collapsed ? undefined : "rotate-180"} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
          <div
            id="app-drawer"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-5 border-r border-border bg-surface-strong px-4 py-5 shadow-lift"
          >
            <div className="flex items-center justify-between gap-2">
              <Brand workspaceName={session.workspaceName} />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setOpen(false)}
              >
                <CloseIcon size={18} />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            <nav aria-label="Primary" className="flex-1 overflow-y-auto">
              <NavList items={primary} pathname={pathname} onNavigate={() => setOpen(false)} />
              <p className="eyebrow mt-6 mb-2 px-3 text-[0.68rem]">Workspace</p>
              <NavList items={secondary} pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <SessionPanel session={session} />
          </div>
        </div>
      ) : null}
    </>
  );
}
