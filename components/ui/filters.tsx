"use client";

/**
 * Filter and search controls.
 *
 * Filter state lives in the URL, not component state: a filtered inventory
 * view is then shareable, bookmarkable, survives a refresh, and the back
 * button does what the user expects.
 *
 * Current values arrive as props from the server page that already read
 * `searchParams`, so these components never need `useSearchParams` and the
 * pages never need a Suspense boundary for them.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SearchIcon } from "./icons";

type Params = Record<string, string | undefined>;

function buildHref(basePath: string, params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") search.set(key, value);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function SearchField({
  basePath,
  paramName = "q",
  value,
  preserve = {},
  placeholder = "Search",
  label,
}: {
  basePath: string;
  paramName?: string;
  value?: string;
  preserve?: Params;
  placeholder?: string;
  label: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the box in step when navigation changes the query from elsewhere
  // (a filter tab, the back button).
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(next: string) {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      router.push(buildHref(basePath, { ...preserve, [paramName]: next || undefined }));
    }, 250);
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <SearchIcon
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
      />
      <input
        type="search"
        className="field pl-9"
        placeholder={placeholder}
        aria-label={label}
        value={draft}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectFilter({
  basePath,
  paramName,
  value,
  options,
  preserve = {},
  label,
}: {
  basePath: string;
  paramName: string;
  value?: string;
  options: { value: string; label: string }[];
  preserve?: Params;
  label: string;
}) {
  const router = useRouter();

  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        className="field w-auto py-2 pr-8"
        value={value ?? "all"}
        aria-label={label}
        onChange={(event) =>
          router.push(
            buildHref(basePath, { ...preserve, [paramName]: event.target.value }),
          )
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
