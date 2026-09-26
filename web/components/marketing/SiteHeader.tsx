"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

/** Sticky marketing header: turns solid on scroll, full-screen menu on phones. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-white/5 bg-zinc-950/75 backdrop-blur-xl" : "bg-transparent"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[14.5px] text-zinc-400 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-[14px] text-zinc-400 transition-colors hover:text-white">
            Log in
          </Link>
          <Link
            href="/signup"
            className="press group inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[14px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Get started <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-zinc-300 md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="orbit-fade fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <Logo />
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-300" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="orbit-stagger mt-6 flex flex-col gap-1 px-5">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3.5 text-[18px] font-medium text-zinc-100 hover:bg-white/5">
                {n.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3.5 text-[18px] font-medium text-zinc-400 hover:bg-white/5">
              Log in
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="mt-4 rounded-xl bg-white px-4 py-3.5 text-center text-[16px] font-semibold text-zinc-950">
              Get started
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
