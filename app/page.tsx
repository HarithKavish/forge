/**
 * Placeholder shell. The real dashboard is built against discovered data once
 * the first provider integration lands — deliberately not a mock-data mockup,
 * which would encode assumptions the adapters may not be able to satisfy.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full bg-(--color-status-syncing)"
        />
        <span className="text-sm font-medium tracking-wide text-(--color-ink-muted) uppercase">
          Foundation
        </span>
      </div>

      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Forge
      </h1>

      <p className="text-lg leading-relaxed text-pretty text-(--color-ink-muted)">
        One place to see everything your projects are built on — which resources
        belong where, what is unassociated, what looks forgotten, and where to go
        to manage it.
      </p>

      <p className="text-sm text-(--color-ink-muted)">
        Schema, provider abstraction and credential handling are in place.
        Authentication and the first integration come next — see{" "}
        <code className="font-mono text-(--color-ink)">docs/ARCHITECTURE.md</code>.
      </p>
    </main>
  );
}
