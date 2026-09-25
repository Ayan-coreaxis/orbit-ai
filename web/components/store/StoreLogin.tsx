"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthWidget } from "./AuthWidget";

/** The core /account/login page. Reuses AuthWidget; on success (or if already signed in) → /account. */
export function StoreLogin({
  businessId,
  authMode,
  alreadyIn,
}: {
  businessId: string;
  authMode: "otp" | "password" | "none" | "both";
  alreadyIn: boolean;
}) {
  const router = useRouter();
  const back = `/store/${businessId}/account`;

  useEffect(() => {
    if (alreadyIn) router.replace(back);
  }, [alreadyIn, router, back]);

  if (alreadyIn) return <p style={{ color: "var(--od-muted)" }}>You&apos;re signed in — taking you to your account…</p>;

  return <AuthWidget businessId={businessId} authMode={authMode} onDone={() => router.replace(back)} />;
}
