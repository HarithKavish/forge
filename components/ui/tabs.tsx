/**
 * Tab strips.
 *
 * Two variants, both plain links so every tab is a real, shareable URL:
 * `RouteTabs` switches between routes (project sections, settings sections),
 * `ViewTabs` switches a query parameter on the same route (inventory views).
 *
 * Both mark the current tab with `aria-current="page"`, which is also what the
 * stylesheet keys the active treatment off — the visual state and the
 * accessible state cannot drift apart.
 */

import Link from "next/link";

export interface RouteTab {
  label: string;
  href: string;
  /** Matched against the current pathname to decide the active tab. */
  match?: (pathname: string) => boolean;
}

export function RouteTabs({
  tabs,
  pathname,
  ariaLabel,
}: {
  tabs: RouteTab[];
  pathname: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="table-scroll -mx-1">
      <div className="flex items-center gap-1 px-1 pb-1">
        {tabs.map((tab) => {
          const active = tab.match ? tab.match(pathname) : pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="tab"
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export interface ViewTab {
  label: string;
  value: string;
  count?: number;
}

export function ViewTabs({
  tabs,
  active,
  basePath,
  paramName = "view",
  preserve = {},
  ariaLabel,
}: {
  tabs: ViewTab[];
  active: string;
  basePath: string;
  paramName?: string;
  preserve?: Record<string, string | undefined>;
  ariaLabel: string;
}) {
  function href(value: string): string {
    const search = new URLSearchParams();
    for (const [key, item] of Object.entries(preserve)) {
      if (item && item !== "all") search.set(key, item);
    }
    if (value !== "all") search.set(paramName, value);
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <nav aria-label={ariaLabel} className="table-scroll -mx-1">
      <div className="flex items-center gap-1 px-1 pb-1">
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <Link
              key={tab.value}
              href={href(tab.value)}
              className="tab"
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="tabular text-xs text-faint">{tab.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
