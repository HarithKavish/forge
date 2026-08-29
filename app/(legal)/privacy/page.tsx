import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Forge collects, why, and how to remove it.",
  robots: { index: true, follow: true },
};

const UPDATED = "28 August 2026";

/**
 * Written from what the code actually does, not from a template. Every claim
 * here is checkable against the repository — if the product changes, this page
 * has to change with it.
 */
export default function PrivacyPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <p className="eyebrow mb-2">Legal</p>
        <h1 className="title-xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>
      </header>

      <section className="surface-card p-5">
        <h2 className="title-lg">In short</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>Forge stores your name and an identifier from your HarithKavish account.</li>
          <li>
            When you connect a platform, Forge stores an encrypted access token
            and a read-only inventory of what it finds there.
          </li>
          <li>There are no analytics, no tracking, and no advertising.</li>
          <li>Nothing is sold, and nothing is shared with anyone.</li>
          <li>You can delete everything yourself, at any time.</li>
        </ul>
      </section>

      <section>
        <h2 className="title-lg">Who runs Forge</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge is operated by Harith Kavish at{" "}
          <span className="font-mono">forge.harithkavish.com</span>. For any
          question about this policy or your data, contact{" "}
          <a className="text-text underline" href="mailto:harithkavish40@gmail.com">
            harithkavish40@gmail.com
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="title-lg">What Forge collects</h2>

        <h3 className="mt-4 text-[0.95rem] font-[650]">When you sign in</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge does not sign you in itself. You sign in to your HarithKavish
          account at{" "}
          <span className="font-mono">auth.harithkavish.com</span>, and Forge is
          told your account identifier and your name. That is all it receives.
          How you proved your identity is decided there, and Forge is not told
          which method you used.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge holds no password, and no token belonging to any authentication
          provider. Your account identifier is issued by the identity service, so
          changing how you sign in never moves your data.
        </p>

        <h3 className="mt-4 text-[0.95rem] font-[650]">When you connect a platform</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Connecting a platform such as GitHub, Cloudflare, Vercel or Neon stores
          two things: an access token for that platform, encrypted at rest, and
          an inventory of the resources it can see &mdash; names, identifiers,
          types, regions, status, creation and last-activity timestamps, and
          platform metadata such as language or visibility.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge only ever issues read requests. It does not create, modify or
          delete anything in your connected accounts. It does not read the
          contents of your repositories, files, databases or environment
          variables.
        </p>

        <h3 className="mt-4 text-[0.95rem] font-[650]">What Forge does not collect</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          No analytics, no tracking pixels, no advertising identifiers, no
          session recording, no third-party scripts. Forge does not build a
          profile of you and there is nothing to opt out of.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Cookies</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge sets only cookies it needs to work. There are no advertising or
          analytics cookies.
        </p>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>
            <span className="font-mono">authjs.session-token</span> &mdash; keeps
            you signed in. HTTP-only, so scripts in your browser cannot read it.
            Expires after 30 days.
          </li>
          <li>
            <span className="font-mono">forge.oauth_state.*</span> &mdash; a
            short-lived anti-forgery value used while connecting a platform.
            Expires after ten minutes.
          </li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your light or dark theme preference is kept in your browser&rsquo;s own
          storage and never sent to the server.
        </p>
      </section>

      <section>
        <h2 className="title-lg">How your data is protected</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>
            Platform access tokens are encrypted with AES-256-GCM before they are
            stored, and each is cryptographically bound to the connection it
            belongs to.
          </li>
          <li>
            A token is decrypted in memory only for the moment Forge is talking
            to that platform. It is never written to logs, never returned by any
            API, and never sent to your browser.
          </li>
          <li>
            Every record is scoped to your own workspace. Queries are filtered by
            workspace at the data layer, so one account&rsquo;s data is not
            reachable from another.
          </li>
          <li>All traffic is served over HTTPS.</li>
        </ul>
      </section>

      <section>
        <h2 className="title-lg">Where your data is held</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge runs on Vercel and stores data in a Neon PostgreSQL database
          hosted in the United States (AWS <span className="font-mono">us-east-2</span>).
          Using Forge means your data is processed there.
        </p>
      </section>

      <section>
        <h2 className="title-lg">How long it is kept</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your account and inventory are kept until you delete them. Disconnecting
          a platform immediately destroys that platform&rsquo;s stored token and
          removes the resources discovered through it.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Deleting your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Go to <Link href="/settings" className="text-text underline">Settings &rarr; Account</Link>{" "}
          and choose <span className="font-[650]">Delete account</span>. This
          removes your user record, its link to your HarithKavish account, your
          workspace, and
          every project, resource, connection and encrypted token in it. It takes
          effect immediately and cannot be undone.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Deleting your Forge account does not touch anything in your connected
          platforms. To revoke Forge&rsquo;s access at the source, remove it from
          that platform&rsquo;s own settings &mdash; for example{" "}
          <span className="font-mono">github.com/settings/applications</span>.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Your rights</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You can access, correct, export or delete your data. Most of it is
          visible in the product; deletion is self-service. For anything else,
          including a copy of your data in a portable form, email{" "}
          <a className="text-text underline" href="mailto:harithkavish40@gmail.com">
            harithkavish40@gmail.com
          </a>{" "}
          and you will get a response within 30 days.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your name comes from your HarithKavish account, so correcting it is done
          at account.harithkavish.com rather than in Forge.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Children</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge is a tool for people managing software infrastructure and is not
          directed at children under 13.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          If this policy changes materially, the date at the top changes and
          anyone with an account will be told by email before it takes effect.
        </p>
      </section>
    </article>
  );
}
