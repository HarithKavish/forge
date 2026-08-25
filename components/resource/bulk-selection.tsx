"use client";

/**
 * Select-all and the live count for the inventory's bulk assign bar.
 *
 * A progressive enhancement only: the checkboxes and the form work without it,
 * this just makes fifty rows bearable. It drives the real checkboxes rather
 * than holding its own state, so what you see ticked is what gets submitted.
 */

import { useEffect, useState } from "react";

export function BulkSelection({ formId }: { formId: string }) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  function boxes(): HTMLInputElement[] {
    const form = document.getElementById(formId);
    if (!form) return [];
    return Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="resourceIds"]'),
    );
  }

  function sync() {
    const all = boxes();
    setTotal(all.length);
    setCount(all.filter((b) => b.checked).length);
  }

  useEffect(() => {
    sync();
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
    // formId is stable for the life of the page.
  }, [formId]);

  function toggleAll(checked: boolean) {
    for (const box of boxes()) box.checked = checked;
    sync();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={total > 0 && count === total}
          // Some but not all: neither ticked nor empty.
          ref={(el) => {
            if (el) el.indeterminate = count > 0 && count < total;
          }}
          onChange={(event) => toggleAll(event.target.checked)}
        />
        <span>Select all</span>
      </label>
      <span className="tabular text-sm text-muted">
        {count === 0 ? "None selected" : `${count} of ${total} selected`}
      </span>
    </div>
  );
}
