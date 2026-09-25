/**
 * Minimal structured logging for the store module. Errors that used to be swallowed by
 * `catch(() => {})` now flow through `logError` so they show up in the platform logs (and in
 * Sentry when `SENTRY_DSN` + `@sentry/nextjs` are present — loaded lazily, never a hard dep).
 */

type Ctx = Record<string, unknown>;

let sentry: { captureException?: (e: unknown, hint?: unknown) => void } | null | undefined;

async function getSentry() {
  if (sentry !== undefined) return sentry;
  if (!process.env.SENTRY_DSN) return (sentry = null);
  try {
    // resolved at runtime only — @sentry/nextjs is an optional peer, never a build dependency
    const mod = "@sentry/nextjs";
    sentry = (await (import(/* webpackIgnore: true */ mod).catch(() => null) as Promise<typeof sentry>)) ?? null;
  } catch {
    sentry = null;
  }
  return sentry;
}

export function logInfo(event: string, ctx?: Ctx) {
  console.info(JSON.stringify({ level: "info", event, ...ctx }));
}

export function logWarn(event: string, ctx?: Ctx) {
  console.warn(JSON.stringify({ level: "warn", event, ...ctx }));
}

export function logError(event: string, error: unknown, ctx?: Ctx) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: "error", event, message, ...ctx }));
  void getSentry().then((s) => s?.captureException?.(error, { tags: { event }, extra: ctx }));
}

/** Run a best-effort side effect (a notification, an analytics write) — log if it throws, never rethrow. */
export async function bestEffort<T>(event: string, fn: () => Promise<T>, ctx?: Ctx): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    logError(event, e, ctx);
    return undefined;
  }
}
