/**
 * Page-level building blocks shared by every route, so headers, cards and
 * empty states stay identical across the app.
 */

import Link from "next/link";

import { ArrowLeftIcon, ChevronRightIcon } from "./icons";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="title-xl text-balance">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-[68ch] text-pretty text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Breadcrumb trail. Always ends in a plain label, never a link to itself. */
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRightIcon size={14} className="text-faint" /> : null}
            {item.href ? (
              <Link href={item.href} className="rounded-full px-1.5 py-0.5 hover:bg-surface-soft hover:text-text">
                {item.label}
              </Link>
            ) : (
              <span className="px-1.5 py-0.5 text-text">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Explicit "up one level" control. Every detail page has one. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn--ghost btn--sm -ml-2">
      <ArrowLeftIcon size={15} />
      {label}
    </Link>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  bodyClassName = "",
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="surface-card overflow-hidden">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="title-lg">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName || "p-5"}>{children}</div>
    </section>
  );
}

/**
 * A single number with its meaning. `hint` carries the caveat — how many
 * resources a cost total excludes, for example — so a figure is never shown
 * as more complete than it is.
 */
export function MetricTile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "error" | "healthy";
  href?: string;
}) {
  const toneClass = {
    default: "text-text",
    healthy: "text-healthy",
    warning: "text-warning",
    error: "text-error",
  }[tone];

  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className={`metric mt-2 ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-[0.82rem] leading-snug text-muted">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="surface-card lift block p-4 focus-visible:outline-2">
        {body}
      </Link>
    );
  }
  return <div className="surface-card p-4">{body}</div>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="title-lg">{title}</p>
      {description ? (
        <p className="max-w-[46ch] text-pretty text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Label/value pair used across every detail page. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * Separates a measurement from a conclusion drawn about it.
 *
 * This component exists because the product must never let the two blur
 * together: the observation is stated as fact, the inference is explicitly
 * labelled as Forge's reading of it.
 */
export function ObservationInference({
  observation,
  inference,
}: {
  observation: string;
  inference?: string;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="eyebrow text-[0.68rem]">Observed</p>
        <p className="mt-1 text-sm">{observation}</p>
      </div>
      {inference ? (
        <div className="border-l-2 border-border pl-3">
          <p className="eyebrow text-[0.68rem]">Forge inference</p>
          <p className="mt-1 text-sm text-muted">{inference}</p>
        </div>
      ) : null}
    </div>
  );
}
