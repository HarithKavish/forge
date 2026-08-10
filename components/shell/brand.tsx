import Link from "next/link";

/**
 * The Forge mark: an anvil silhouette reduced to three strokes. Drawn rather
 * than lettered so the shell has one non-textual anchor, and it reads at 28px.
 */
export function ForgeMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="9"
        fill="var(--accent)"
      />
      <path
        d="M8 13h11.5a4.5 4.5 0 0 0 4.5-4.5V8"
        fill="none"
        stroke="var(--surface-strong)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M8 13v3a3 3 0 0 0 3 3h5"
        fill="none"
        stroke="var(--surface-strong)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 24h9"
        fill="none"
        stroke="var(--surface-strong)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
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
