"use client";

/**
 * Theme toggle.
 *
 * The choice is shared with every other harithkavish.com surface through
 * HarithStore, so dark here is dark there. An explicit choice wins and the
 * system preference is only the starting point. The
 * `data-theme` attribute on <html> is set by an inline script before first
 * paint (see app/layout.tsx), so there is no flash of the wrong theme.
 */

import { useEffect, useState } from "react";

import { store, THEME_KEY } from "@/lib/ecosystem/store";

const LEGACY_KEY = "forge-theme";

/* Parity with window.HarithTheme (the vanilla sites' toggle) and
   account's ThemeToggle: both flip this class alongside data-theme, per
   design-system's docs/shell-contract.md. Nothing here reads it back —
   data-theme stays this component's only source of truth — so setting it
   only widens who else can recognize the current theme. */
function applyTheme(next: "light" | "dark") {
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle("dark-mode", next === "dark");
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    store().migrate(THEME_KEY, LEGACY_KEY);
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
    setReady(true);

    /* Changed on another surface — follow it rather than disagreeing. */
    store().subscribe((key, value) => {
      if (key !== THEME_KEY) return;
      const next = value === "dark" ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    });
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    store().set(THEME_KEY, next);
    setTheme(next);
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className={compact ? "theme-toggle" : "theme-toggle w-full justify-start"}
      aria-label={label}
      // Render neutrally until the client knows the real theme, so the two
      // passes agree and hydration stays quiet.
      title={ready ? label : undefined}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
      {compact ? null : <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
