import Image from "next/image";
import Link from "next/link";

import markSrc from "@/public/brand/mark.png";
import logoSrc from "@/public/brand/logo-full.png";

/**
 * The Forge mark.
 *
 * Cropped from the brand artwork to the HK letterforms and set on a dark
 * rounded tile. Two reasons for the crop and the tile:
 *
 *  - The full artwork's wires and service glyphs turn to noise below ~64px,
 *    which is most of the places a mark appears. The letterforms survive.
 *  - The artwork is a glow design with a transparent background, so it needs a
 *    dark ground to read at all. The tile gives it one in both themes, and the
 *    hairline edge keeps the silhouette visible on a dark page too.
 *
 * The full artwork is used by {@link ForgeLogo}, where there is room for it.
 */
export function ForgeMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src={markSrc}
      alt=""
      width={size}
      height={size}
      // Small, above the fold, and on every authenticated page.
      priority
      className="flex-none rounded-[0.42em]"
      style={{ width: size, height: size }}
    />
  );
}

/** The complete artwork, for places with enough room to show the detail. */
export function ForgeLogo({ size = 96 }: { size?: number }) {
  return (
    <Image
      src={logoSrc}
      alt="Forge"
      width={size}
      height={size}
      priority
      className="h-auto flex-none"
      style={{ width: size }}
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
