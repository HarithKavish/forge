import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://forge.harithkavish.com",
  ),
  title: {
    default: "Forge",
    template: "%s · Forge",
  },
  description:
    "Forge is a project-centric workspace for everything your projects are built on — which resources belong where, what is unassociated, what looks forgotten, and where to manage it.",
  applicationName: "Forge",
  // An application, not a site to be indexed page by page.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1014" },
  ],
};

/**
 * Resolves the theme before first paint so the page never flashes the wrong
 * one. An explicit choice wins; otherwise the system preference decides.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('forge-theme');
  var dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme attribute is written by the script above, so the server's
    // markup legitimately differs from the client's first read.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The ecosystem's foundations. Forge adds its own tokens on top in
            globals.css and no longer restates the shared ones. */}
        <link
          rel="stylesheet"
          href="https://harithkavish.com/design-system/v1.0.0/tokens.css?v=20260829.2"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
