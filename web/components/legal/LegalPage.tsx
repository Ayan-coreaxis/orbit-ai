import Link from "next/link";
import { Compass } from "lucide-react";

export const LEGAL_UPDATED = "26 September 2026";

/** Where people reach Orbit about privacy / terms. Set LEGAL_CONTACT_EMAIL in the environment. */
export function legalContact(): string | null {
  const e = process.env.LEGAL_CONTACT_EMAIL?.trim();
  return e && e.includes("@") ? e : null;
}

export function ContactLine() {
  const email = legalContact();
  return email ? (
    <a href={`mailto:${email}`} className="text-zinc-200 underline underline-offset-2">
      {email}
    </a>
  ) : (
    <span>the Help option in your Orbit dashboard</span>
  );
}

/** Shared shell for /privacy and /terms — same look as the landing page. */
export function LegalPage({ title, intro, sections }: { title: string; intro: React.ReactNode; sections: { id: string; title: string; body: React.ReactNode }[] }) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-300">
      <header className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold text-zinc-100">
            <Compass className="h-5 w-5" /> orbit.ai
          </Link>
          <nav className="flex gap-5 text-[13px] text-zinc-500">
            <Link href="/privacy" className="hover:text-zinc-200">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-200">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        <p className="mt-2 text-[13px] text-zinc-500">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-6 text-[15px] leading-relaxed">{intro}</div>
        <nav className="mt-8 rounded-xl border border-zinc-900 p-5 text-[13.5px]">
          <div className="mb-2 font-medium text-zinc-400">On this page</div>
          <ol className="grid gap-1 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-zinc-400 hover:text-zinc-100">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-6 pt-10">
            <h2 className="text-xl font-semibold text-zinc-100">
              {i + 1}. {s.title}
            </h2>
            <div className="legal mt-3 space-y-3 text-[15px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-zinc-100 [&_ul]:space-y-1.5">{s.body}</div>
          </section>
        ))}
      </main>
      <footer className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-3xl justify-between px-6 py-8 text-[13px] text-zinc-600">
          <span>© {new Date().getFullYear()} orbit.ai</span>
          <Link href="/" className="hover:text-zinc-300">Home</Link>
        </div>
      </footer>
    </div>
  );
}
