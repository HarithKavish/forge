import Link from "next/link";

/**
 * Never a dead end: a missing resource or project offers the two places worth
 * going next rather than just stating the failure.
 */
export default function NotFound() {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="max-w-[34rem] text-center">
        <p className="eyebrow mb-3">404</p>
        <h1 className="title-xl text-balance">This page does not exist</h1>
        <p className="mt-3 text-pretty text-muted">
          The project or resource may have been removed, or the link may be out
          of date.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/home" className="btn btn--primary">
            Go to Home
          </Link>
          <Link href="/resources" className="btn">
            Browse resources
          </Link>
          <Link href="/projects" className="btn btn--ghost">
            Projects
          </Link>
        </div>
      </div>
    </div>
  );
}
