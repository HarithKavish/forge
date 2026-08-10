"use client";

/**
 * Theme toggle.
 *
 * Follows the ecosystem's approach: an explicit user choice stored in
 * localStorage wins, and the system preference is only the starting point. The
 * `data-theme` attribute on <html> is set by an inline script before first
 * paint (see app/layout.tsx), so there is no flash of the wrong theme.
 */

import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/components/ui/icons";

const STORAGE_KEY = "forge-theme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
    setReady(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className={compact ? "btn btn--ghost btn--sm" : "btn btn--ghost w-full justify-start"}
      aria-label={label}
      // Render neutrally until the client knows the real theme, so the two
      // passes agree and hydration stays quiet.
      title={ready ? label : undefined}
    >
      {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      {compact ? null : <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
