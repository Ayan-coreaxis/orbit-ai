"use client";

import { ErrorView } from "@/components/system/ErrorView";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <ErrorView error={error} retry={retry} />
    </div>
  );
}
