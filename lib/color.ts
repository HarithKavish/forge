/**
 * The Worldview person-color palette (docs/WORLDVIEW.md §9).
 *
 * A validated categorical set -- run through the dataviz skill's palette
 * validator for both themes as this exact ordered sequence (order is part
 * of what was validated, not cosmetic: it's what keeps adjacent slots
 * colorblind-distinguishable). Never add, remove, or reorder an entry
 * without re-validating the whole sequence.
 *
 * Three of the eight (aqua, yellow, magenta) sit below 3:1 contrast against
 * a light surface on their own -- never render one as the only signal.
 * Worldview never does: every person color appears next to an initial, a
 * name, or a provider icon, never as a bare swatch.
 */
const PALETTE: { light: string; dark: string }[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#e87ba4", dark: "#d55181" }, // magenta
  { light: "#008300", dark: "#008300" }, // green
  { light: "#4a3aa7", dark: "#9085e9" }, // violet
  { light: "#e34948", dark: "#e66767" }, // red
];

export const PERSON_COLOR_PALETTE: ReadonlyArray<{ light: string; dark: string }> = PALETTE;

function hashIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/**
 * Resolves a person's Worldview color: their explicit pick if it's a
 * recognized palette entry, else a value deterministically derived from
 * their user id -- so an unset (or corrupted) color is still stable across
 * renders rather than random each time. `explicit` is matched against the
 * palette's light-mode hex, since that's what's stored; the dark-mode
 * partner comes along with it, never chosen independently.
 */
export function personColor(userId: string, explicit?: string | null): { light: string; dark: string } {
  const match = explicit ? PALETTE.find((entry) => entry.light === explicit) : undefined;
  // hashIndex is `% PALETTE.length`, always in range -- the fallback is
  // unreachable, only here to satisfy noUncheckedIndexedAccess.
  return match ?? PALETTE[hashIndex(userId, PALETTE.length)] ?? PALETTE[0]!;
}

/**
 * Inline custom properties for the `.person-color-bg` class (app/globals.css)
 * to read -- pairs with it rather than setting `backgroundColor` directly, so
 * the color still switches with the viewer's theme.
 */
export function personColorStyle(color: {
  light: string;
  dark: string;
}): Record<string, string> {
  return { "--person-color-light": color.light, "--person-color-dark": color.dark };
}
