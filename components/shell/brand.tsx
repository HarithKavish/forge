import Image from "next/image";
import Link from "next/link";

import markSrc from "@/public/brand/mark.png";
import logoSrc from "@/public/brand/logo-full.png";

/**
 * The Forge mark — the brand artwork, unaltered apart from trimming its empty
 * transparent margin and squaring the canvas so it scales without distortion.
 */
export function ForgeMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src={markSrc}
      alt=""
      width={size}
      height={size}
      // Small, above the fold, and present on every authenticated page.
      priority
      className="flex-none"
      style={{ width: size, height: size }}
    />
  );
}

/** The same artwork at a size where its detail is legible. */
export function ForgeLogo({ size = 96 }: { size?: number }) {
  return (
    <Image
      src={logoSrc}
      alt="Forge"
      width={size}
      height={size}
      priority
      className="flex-none"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Brand block. The second line is the workspace, not a tagline — the shell
 * should say whose data is on screen, which is what makes it a workspace
 * rather than an admin panel.
 */
export function Brand({
  workspaceName,
  href = "/home",
}: {
  workspaceName?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5 rounded-2xl">
      <ForgeMark />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[0.98rem] font-[650] tracking-[0.01em]">Forge</span>
        {workspaceName ? (
          <span className="truncate text-[0.78rem] text-muted">{workspaceName}</span>
        ) : null}
      </span>
    </Link>
  );
}
