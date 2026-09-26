import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/marketing/AuthShell";
import { ResetForm } from "@/components/marketing/PasswordForms";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Set a new password" subtitle="Choose a password you don't use anywhere else.">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
