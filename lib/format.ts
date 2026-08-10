/**
 * Display formatting.
 *
 * Relative times are measured against the demo's fixed snapshot rather than
 * the wall clock, so server and client render the same string and the demo
 * keeps telling a coherent story. When real data lands, `NOW` becomes
 * `new Date()` and nothing else changes.
 */

import { SEED_NOW } from "@/lib/mock/seed";
import type {
  ActivityState,
  CostAccuracy,
  ResourcePresence,
  StatusLevel,
  SyncStatus,
} from "@/lib/data/types";

const NOW = SEED_NOW;

export function relativeTime(iso: string | undefined, fallback = "Never"): string {
  if (!iso) return fallback;

  const diffMs = NOW.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} ago`;

  return `${Math.round(months / 12)} years ago`;
}

/** Whole days, used where the copy needs a bare number ("63 days"). */
export function daysSince(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  return Math.floor((NOW.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function absoluteDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function money(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);
}

export function statusLabel(level: StatusLevel): string {
  return { healthy: "Healthy", warning: "Warning", error: "Unhealthy", unknown: "Unknown" }[level];
}

export function activityLabel(state: ActivityState): string {
  return {
    active: "Active",
    recently_inactive: "Recently inactive",
    potentially_unused: "Potentially unused",
    unknown: "Unknown",
  }[state];
}

/** The status level an activity state maps to when shown as a badge. */
export function activityTone(state: ActivityState): StatusLevel {
  return {
    active: "healthy",
    recently_inactive: "warning",
    potentially_unused: "warning",
    unknown: "unknown",
  }[state] as StatusLevel;
}

export function costAccuracyLabel(accuracy: CostAccuracy): string {
  return {
    actual: "Actual",
    provider_reported: "Provider-reported",
    estimated: "Estimated by Forge",
    unavailable: "Unavailable",
  }[accuracy];
}

export function presenceLabel(presence: ResourcePresence): string {
  return { live: "Present", missing: "Missing at provider", archived: "Archived" }[presence];
}

export function syncStatusLabel(status: SyncStatus | undefined): string {
  if (!status) return "Never synchronized";
  return {
    queued: "Queued",
    running: "Running",
    succeeded: "Successful",
    partial: "Partial",
    failed: "Failed",
  }[status];
}

export function syncStatusTone(status: SyncStatus | undefined): StatusLevel {
  if (!status) return "unknown";
  return {
    queued: "unknown",
    running: "unknown",
    succeeded: "healthy",
    partial: "warning",
    failed: "error",
  }[status] as StatusLevel;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  "github.repository": "Repository",
  "vercel.project": "Project",
  "aws.ec2.instance": "EC2 instance",
  "aws.ec2.elastic_ip": "Elastic IP",
  "aws.ec2.security_group": "Security group",
  "aws.ebs.volume": "EBS volume",
  "aws.s3.bucket": "S3 bucket",
  "aws.rds.instance": "RDS instance",
  "aws.lambda.function": "Lambda function",
  "aws.elb.load_balancer": "Load balancer",
  "mongodb.cluster": "Cluster",
  "cloudflare.zone": "Zone",
  "cloudflare.worker": "Worker",
};

/** Falls back to the trailing segment so an unknown type still reads sensibly. */
export function resourceTypeLabel(type: string): string {
  const known = RESOURCE_TYPE_LABELS[type];
  if (known) return known;
  const tail = type.split(".").pop() ?? type;
  return tail.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
