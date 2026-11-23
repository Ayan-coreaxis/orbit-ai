import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { AuthShell } from "@/components/marketing/AuthShell";
import { confirmVerifyToken } from "@/lib/email-verify";

export const metadata: Metadata = { title: "Confirm your email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await confirmVerifyToken(token);
  return (
    <AuthShell
      title={ok ? "Email confirmed" : "That link didn't work"}
      subtitle={ok ? "Thanks — your account is all set." : "It may have expired or already been used. Send a fresh one from your dashboard."}
    >
      <div className="flex flex-col items-center text-center">
        {ok ? <CheckCircle2 className="h-12 w-12 text-good" /> : <XCircle className="h-12 w-12 text-bad" />}
        <Link href="/dashboard" className="btn-primary mt-6 w-full">
          Go to my dashboard
        </Link>
      </div>
    </AuthShell>
  );
}
