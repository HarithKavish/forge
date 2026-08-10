/**
 * Status indicators.
 *
 * Colour is never the only signal: each badge pairs its colour with a distinct
 * glyph shape and a text label, so the meaning survives greyscale, colour
 * blindness and a screen reader.
 */

import {
  activityLabel,
  activityTone,
  statusLabel,
  syncStatusLabel,
  syncStatusTone,
} from "@/lib/format";
import type { ActivityState, StatusLevel, SyncStatus } from "@/lib/data/types";

const PILL_CLASS: Record<StatusLevel, string> = {
  healthy: "pill pill--healthy",
  warning: "pill pill--warning",
  error: "pill pill--error",
  unknown: "pill pill--unknown",
};

/** A distinct silhouette per level — circle, triangle, square, ring. */
function StatusGlyph({ level }: { level: StatusLevel }) {
  const common = { width: 10, height: 10, viewBox: "0 0 10 10", "aria-hidden": true as const };

  if (level === "healthy") {
    return (
      <svg {...common} fill="currentColor">
        <circle cx="5" cy="5" r="4" />
      </svg>
    );
  }
  if (level === "warning") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M5 0.5 9.5 9h-9z" />
      </svg>
    );
  }
  if (level === "error") {
    return (
      <svg {...common} fill="currentColor">
        <rect x="0.8" y="0.8" width="8.4" height="8.4" rx="1.6" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="5" cy="5" r="3.6" />
    </svg>
  );
}

export function StatusBadge({
  level,
  label,
}: {
  level: StatusLevel;
  label?: string;
}) {
  return (
    <span className={PILL_CLASS[level]}>
      <StatusGlyph level={level} />
      {label ?? statusLabel(level)}
    </span>
  );
}

/**
 * Activity is an inference, so it is rendered in its own badge rather than
 * merged into health — a resource can be perfectly healthy and still unused.
 */
export function ActivityBadge({ state }: { state: ActivityState }) {
  return <StatusBadge level={activityTone(state)} label={activityLabel(state)} />;
}

export function SyncBadge({ status }: { status: SyncStatus | undefined }) {
  return <StatusBadge level={syncStatusTone(status)} label={syncStatusLabel(status)} />;
}

/** Compact dot for dense rows where a full badge would crowd the layout. */
export function StatusDot({ level, title }: { level: StatusLevel; title?: string }) {
  const color: Record<StatusLevel, string> = {
    healthy: "text-healthy",
    warning: "text-warning",
    error: "text-error",
    unknown: "text-unknown",
  };
  return (
    <span className={`inline-flex items-center ${color[level]}`} title={title ?? statusLabel(level)}>
      <StatusGlyph level={level} />
      <span className="sr-only">{title ?? statusLabel(level)}</span>
    </span>
  );
}
