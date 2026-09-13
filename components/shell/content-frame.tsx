"use client";

/**
 * Everywhere except Worldview gets the standard padded, max-width content
 * column. Worldview is a full-bleed 3D scene -- it needs the entire
 * remaining viewport (next to the nav), not a centered column with margins,
 * so it gets its own branch here instead.
 */

import { usePathname } from "next/navigation";

export function ContentFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith("/worldview")) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
      {children}
    </div>
  );
}
