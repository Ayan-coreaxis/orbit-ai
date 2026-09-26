import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/marketing/AuthShell";
import { AuthForm } from "@/components/marketing/AuthForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your store and your AI team."
      footer={
        <>
          New to Orbit?{" "}
          <Link href="/signup" className="font-medium text-zinc-200 hover:text-white">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
