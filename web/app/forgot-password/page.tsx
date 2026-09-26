import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/marketing/AuthShell";
import { ForgotForm } from "@/components/marketing/PasswordForms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to set a new one." footer={<Link href="/login" className="text-zinc-300 hover:text-white">Back to log in</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
