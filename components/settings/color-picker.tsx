"use client";

/**
 * The Worldview person-color picker (docs/WORLDVIEW.md §9). Restricted to
 * the validated palette (lib/color.ts) -- eight swatches, click one to
 * submit, no free color input. "Auto" clears the explicit pick and falls
 * back to the deterministic per-user color.
 */

import { setMemberColorAction } from "@/lib/data/actions";
import { PERSON_COLOR_PALETTE } from "@/lib/color";

export function ColorPicker({ current }: { current: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERSON_COLOR_PALETTE.map((entry) => (
        <form action={setMemberColorAction} key={entry.light}>
          <input type="hidden" name="color" value={entry.light} />
          <button
            type="submit"
            className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: entry.light,
              borderColor: current === entry.light ? "var(--text)" : "transparent",
            }}
            aria-label={`Use ${entry.light} as my Worldview color`}
            aria-pressed={current === entry.light}
          />
        </form>
      ))}
      <form action={setMemberColorAction}>
        <input type="hidden" name="color" value="" />
        <button
          type="submit"
          className={`btn btn--sm ${current === null ? "btn--ghost" : ""}`}
          disabled={current === null}
        >
          Auto
        </button>
      </form>
    </div>
  );
}
