import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vercel integration",
  description:
    "What the Forge integration for Vercel reads, how to install it, and how to remove it.",
  robots: { index: true, follow: true },
};

/**
 * Public documentation for the Vercel integration.
 *
 * Vercel requires a documentation URL on the integration listing and fetches it
 * during review, so this has to render without a session. Every claim here is
 * checkable against lib/providers/vercel — if the adapter starts reading
 * something new, this page changes with it.
 */
export default function VercelDocsPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <p className="eyebrow mb-2">Documentation</p>
        <h1 className="title-xl">Vercel integration</h1>
        <p className="mt-2 text-pretty text-muted">
          Organise your Vercel projects and domains by the project they belong
          to, alongside everything else Forge has discovered.
        </p>
      </header>

      <section className="surface-card p-5">
        <h2 className="title-lg">In short</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>Forge reads an inventory of your Vercel projects and domains.</li>
          <li>It only ever issues read requests. Nothing is created or changed.</li>
          <li>It never reads source code, environment variables or logs.</li>
          <li>Uninstalling from Vercel revokes access immediately.</li>
        </ul>
      </section>

      <section>
        <h2 className="title-lg">What Forge is</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge is a project-centric view of everything your projects are built
          on. It connects to the platforms you already use, discovers what is
          there, and groups it by the real-world project it belongs to &mdash; so
          you can see which resources serve which project, what is unassociated,
          and what looks forgotten.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Installing it</h2>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>
            Sign in to Forge and open <span className="font-[650]">Integrations</span>.
          </li>
          <li>
            Choose <span className="font-[650]">Vercel</span> and select{" "}
            <span className="font-[650]">Connect</span>. Forge sends you to Vercel
            to install the integration.
          </li>
          <li>
            Pick the personal account or team whose resources you want Forge to
            see, then authorise.
          </li>
          <li>
            Vercel returns you to Forge, which runs a first discovery. Your
            projects and domains appear in{" "}
            <span className="font-[650]">Resources</span>, ready to assign to a
            project.
          </li>
        </ol>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Installing against a team scopes the connection to that team. To cover
          several teams, install once per team.
        </p>
      </section>

      <section>
        <h2 className="title-lg">What it reads</h2>
        <div className="surface-inset mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead>
              <tr className="border-b border-(--border)">
                <th className="px-4 py-2.5 font-[650]">Permission</th>
                <th className="px-4 py-2.5 font-[650]">Used for</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-(--border)">
                <td className="px-4 py-2.5 font-[650]">Projects (read)</td>
                <td className="px-4 py-2.5">
                  Name, framework, creation date, and the latest production
                  deployment &mdash; which is how Forge tells whether a project is
                  still in use.
                </td>
              </tr>
              <tr className="border-b border-(--border)">
                <td className="px-4 py-2.5 font-[650]">Domains (read)</td>
                <td className="px-4 py-2.5">
                  Domain names, whether each is an apex domain, and whether it is
                  assigned to a project.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-[650]">User and team (read)</td>
                <td className="px-4 py-2.5">
                  The account or team the connection belongs to, so resources are
                  attributed to the right scope and labelled clearly.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          That is the whole list. Forge does not request write permissions, and
          does not read source code, environment variables, secrets, build output
          or deployment logs.
        </p>
      </section>

      <section>
        <h2 className="title-lg">How the connection is stored</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The access token is encrypted with AES-256-GCM before it is stored, and
          bound to the connection it belongs to. It is decrypted in memory only
          for the moment Forge is talking to Vercel. It is never written to logs,
          never returned by any API, and never sent to your browser.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Observations and inferences</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge separates what it measured from what it concluded. A project
          marked <span className="font-[650]">potentially unused</span> means no
          production deployment was observed in the period shown &mdash; not that
          the project is unnecessary. Check before acting on it.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Removing it</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Uninstall the integration from your Vercel dashboard to revoke access
          immediately. Disconnecting Vercel inside Forge destroys the stored token
          and removes the resources discovered through it. Deleting your Forge
          account removes everything at once.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Support</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Email{" "}
          <a className="text-text underline" href="mailto:harithkavish40@gmail.com">
            harithkavish40@gmail.com
          </a>
          . See also the{" "}
          <Link href="/privacy" className="text-text underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-text underline">
            Terms of Service
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
