"use client";

import { ErrorView } from "@/components/system/ErrorView";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/dashboard" />;
}
