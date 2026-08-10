"use client";

import { usePathname } from "next/navigation";

import { RouteTabs } from "@/components/ui/tabs";

/**
 * Project section navigation. A client component only because it needs the
 * current pathname to mark the active tab; the tabs themselves are plain links.
 */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <RouteTabs
      ariaLabel="Project sections"
      pathname={pathname}
      tabs={[
        { label: "Overview", href: base },
        { label: "Services", href: `${base}/services` },
        { label: "Resources", href: `${base}/resources` },
        { label: "Activity", href: `${base}/activity` },
        { label: "Costs", href: `${base}/costs` },
      ]}
    />
  );
}
