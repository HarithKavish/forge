import Link from "next/link";

import { ForgeMark } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * Chrome for the public legal pages.
 *
 * Deliberately outside the authenticated shell: Google and Vercel fetch these
 * URLs while reviewing the app, and both must render for someone who is not
 * signed in.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <ForgeMark />
          <span className="text-[0.98rem] font-[650] tracking-[0.01em]">Forge</span>
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="mx-auto w-full max-w-[46rem] flex-1 px-5 py-8 sm:px-8">
        {children}
      </main>

      <footer className="mx-auto flex w-full max-w-[46rem] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[0.8rem] text-faint sm:px-8">
        <span>Forge · forge.harithkavish.com</span>
        <span className="flex gap-3">
          <Link href="/privacy" className="hover:text-text">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-text">
            Terms
          </Link>
          <Link href="/login" className="hover:text-text">
            Sign in
          </Link>
        </span>
      </footer>
    </div>
  );
}
