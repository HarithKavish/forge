/**
 * The ecosystem's shared key/value store, loaded in app/layout.tsx from the
 * design system.
 *
 * localStorage is scoped to an origin and the ecosystem is a dozen of them, so
 * a value kept here alone would never reach nexus, blog or account. HarithStore
 * keeps it in a cookie on .harithkavish.com that every surface can read.
 *
 * Display state only — never a credential. Every subdomain can read it and it
 * travels with each request to the domain.
 */
export type HarithStore = {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
  remove(key: string): void;
  migrate(key: string, legacyKey: string): void;
  subscribe(fn: (key: string, value: string | null) => void): void;
};

declare global {
  interface Window {
    HarithStore?: HarithStore;
  }
}

/** Per-origin fallback for previews and localhost, where the shared cookie cannot be set. */
const local: HarithStore = {
  get: (k) => {
    try {
      return localStorage.getItem(`hk.${k}`);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(`hk.${k}`, v);
    } catch {
      /* storage blocked */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(`hk.${k}`);
    } catch {
      /* storage blocked */
    }
  },
  migrate: () => {},
  subscribe: () => {},
};

export function store(): HarithStore {
  if (typeof window === "undefined") return local;
  return window.HarithStore ?? local;
}

export const THEME_KEY = "theme";
