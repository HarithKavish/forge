/**
 * Small cookie value codec.
 *
 * Used by the demo data layer to keep per-device state (project assignments,
 * simulated connections). Deliberately generic and unrelated to authentication:
 * real sessions are issued and validated by Auth.js, never by this.
 *
 * Edge-safe — web APIs only, no Buffer.
 */

/** base64url of UTF-8 JSON. Unicode-safe, unlike a bare btoa(JSON). */
export function encodeCookieValue(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns null on anything malformed, so a corrupt cookie is simply ignored. */
export function decodeCookieValue<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
