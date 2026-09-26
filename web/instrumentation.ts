import type { Instrumentation } from "next";

const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "ADMIN_PASSWORD", "ANTHROPIC_API_KEY", "NEXT_PUBLIC_APP_URL", "CRON_SECRET"];

/** On boot: say loudly in the logs which required settings are missing (Super Admin shows them too). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // API keys saved in Super Admin live (encrypted) in the database: load them now and keep them fresh.
    const { loadStoredKeys } = await import("@/lib/env-file");
    await loadStoredKeys(true);
    setInterval(() => void loadStoredKeys(), 60_000).unref?.();
  }
  if (process.env.NODE_ENV !== "production") return;
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) console.error(JSON.stringify({ level: "error", event: "config.missing", missing }));
  if ((process.env.AUTH_SECRET ?? "").length < 32) console.error(JSON.stringify({ level: "error", event: "config.weak_auth_secret" }));
}

/** Every server error becomes one structured log line (searchable by its digest, which users see as "Ref"). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      event: "request.error",
      message: e?.message?.slice(0, 500),
      digest: e?.digest,
      path: request.path,
      method: request.method,
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
