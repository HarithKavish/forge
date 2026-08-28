import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Forge.",
  robots: { index: true, follow: true },
};

const UPDATED = "28 August 2026";

export default function TermsPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <p className="eyebrow mb-2">Legal</p>
        <h1 className="title-xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>
      </header>

      <section className="surface-card p-5">
        <h2 className="title-lg">In short</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>Forge shows you what your projects are built on. It reads; it does not change anything.</li>
          <li>It is free, early software, provided as-is and without warranty.</li>
          <li>What Forge infers &mdash; such as &ldquo;potentially unused&rdquo; &mdash; is a signal, not a fact. Check before acting.</li>
          <li>You can stop and delete everything at any time.</li>
        </ul>
      </section>

      <section>
        <h2 className="title-lg">What Forge is</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge connects to platforms you already use, discovers the resources
          there, and organises them by project. It is operated by Harith Kavish
          at <span className="font-mono">forge.harithkavish.com</span>. Using it
          means accepting these terms and the{" "}
          <Link href="/privacy" className="text-text underline">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Your account</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You sign in with Google and are responsible for that account&rsquo;s
          security. You must be old enough to enter a contract where you live,
          and you may only connect platform accounts you are authorised to
          access.
        </p>
      </section>

      <section>
        <h2 className="title-lg">What Forge does with your connections</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          When you connect a platform you grant Forge read access to the
          resources you choose. Forge only issues read requests: it does not
          create, modify, delete, stop or reconfigure anything in your accounts.
          The only action it offers is a link to the platform where a resource is
          managed.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You can disconnect a platform at any time, which destroys the stored
          token and removes the resources discovered through it. You can also
          revoke access from the platform&rsquo;s own settings.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Observations and inferences</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge distinguishes what it measured from what it concludes, and shows
          both. A resource labelled <span className="font-[650]">potentially
          unused</span> means no activity signal was observed in a given period
          &mdash; not that the resource is unnecessary. Cost figures are shown
          only when a platform reports them, and are labelled with how far they
          can be trusted.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          These signals are there to help you decide. They are not advice, and
          you are responsible for verifying anything before acting on it. Forge
          is not liable for a resource you remove on the strength of one.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Acceptable use</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Do not:</p>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>connect accounts you do not have permission to access;</li>
          <li>attempt to reach another user&rsquo;s workspace or data;</li>
          <li>probe or interfere with the service, or work around its limits;</li>
          <li>use Forge to break the terms of a connected platform, or any law.</li>
        </ul>
      </section>

      <section>
        <h2 className="title-lg">Availability</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge is early software offered free of charge. There is no uptime
          commitment, and features may change or be removed. It may be
          unavailable for maintenance, or because a platform it depends on is.
        </p>
      </section>

      <section>
        <h2 className="title-lg">No warranty</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Forge is provided &ldquo;as is&rdquo;, without warranty of any kind,
          express or implied, including fitness for a particular purpose and
          non-infringement. It is not guaranteed that the inventory is complete
          or current: platforms rate-limit, change their APIs and go down, and
          Forge can only report what it was able to read.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Limitation of liability</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          To the fullest extent the law allows, Forge and its operator are not
          liable for indirect, incidental or consequential loss, including lost
          profits, lost data, or infrastructure changes you made based on what
          Forge displayed. Since Forge is free, total liability is limited to
          zero.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Ending it</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You can stop at any time by deleting your account in{" "}
          <Link href="/settings" className="text-text underline">Settings</Link>,
          which removes your data immediately. Access may be suspended or removed
          for breaching these terms, or if the service is discontinued &mdash; in
          which case reasonable notice will be given so you can export anything
          you need.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          These terms may change. The date at the top will change with them, and
          material changes will be notified by email before taking effect.
          Continuing to use Forge after that means accepting the new terms.
        </p>
      </section>

      <section>
        <h2 className="title-lg">Contact</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <a className="text-text underline" href="mailto:harithkavish40@gmail.com">
            harithkavish40@gmail.com
          </a>
        </p>
      </section>
    </article>
  );
}
