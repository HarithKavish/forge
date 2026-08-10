"use client";

import { usePathname } from "next/navigation";

import { RouteTabs } from "@/components/ui/tabs";

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <RouteTabs
      ariaLabel="Settings sections"
      pathname={pathname}
      tabs={[
        { label: "Account", href: "/settings" },
        { label: "Workspace", href: "/settings/workspace" },
        { label: "Security", href: "/settings/security" },
        { label: "Preferences", href: "/settings/preferences" },
      ]}
    />
  );
}
