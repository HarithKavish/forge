import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation",
  description: "How Forge connects to each platform, and what it reads.",
  robots: { index: true, follow: true },
};

/** One entry per connector that has public documentation. */
const CONNECTORS = [
  {
    href: "/docs/vercel",
    name: "Vercel",
    summary: "Projects and domains, discovered through a read-only integration.",
  },
];

export default function DocsPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <p className="eyebrow mb-2">Documentation</p>
        <h1 className="title-xl">Connecting a platform</h1>
        <p className="mt-2 text-pretty text-muted">
          Forge discovers what your projects are built on. Every connector is
          read-only: Forge reads an inventory, and never changes anything in the
          account it is connected to.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {CONNECTORS.map((connector) => (
          <Link
            key={connector.href}
            href={connector.href}
            className="surface-card lift block p-5"
          >
            <h2 className="title-lg">{connector.name}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {connector.summary}
            </p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="title-lg">Other platforms</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          GitHub, Cloudflare and Neon connect from{" "}
          <Link href="/integrations" className="text-text underline">
            Integrations
          </Link>{" "}
          inside the app, which explains what each one asks for at the point you
          connect it.
        </p>
      </section>
    </article>
  );
}
