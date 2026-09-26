import Link from "next/link";
import { Compass } from "lucide-react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="Orbit home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 shadow-[0_0_24px_rgba(217,70,239,0.35)] transition-transform duration-300 group-hover:rotate-12">
        <Compass className="h-5 w-5 text-white" strokeWidth={2.5} />
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-white">
        orbit<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 bg-clip-text text-transparent">.ai</span>
      </span>
    </Link>
  );
}
