import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="orbit-fade-up text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
          <Compass className="h-7 w-7 text-white" />
        </div>
        <p className="mt-6 font-mono text-[13px] text-zinc-500">404</p>
        <h1 className="mt-1 text-2xl font-semibold">This page drifted out of orbit</h1>
        <p className="mt-2 text-[14.5px] text-zinc-400">The link may be old, or the page was moved.</p>
        <div className="mt-7 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-white px-4 py-2 text-[13.5px] font-semibold text-zinc-900 hover:bg-zinc-200">Home</Link>
          <Link href="/dashboard" className="rounded-lg border border-zinc-800 px-4 py-2 text-[13.5px] font-medium hover:bg-zinc-900">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
