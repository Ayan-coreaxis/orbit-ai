import { prisma } from "@/lib/prisma";

/**
 * Durable, cross-instance rate limiting backed by the `RateLimit` table (an in-memory Map resets
 * on every deploy and is per-instance on serverless). Fixed-window counter. Fails OPEN — if the
 * DB hiccups we let the request through rather than block real customers.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  try {
    // One atomic increment per request, so parallel requests can't all read "under the limit".
    const row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: { increment: 1 } },
    });
    if (now.getTime() - row.windowStart.getTime() > windowMs) {
      // Window over: start a new one (only one request wins the reset).
      await prisma.rateLimit.updateMany({ where: { key, windowStart: row.windowStart }, data: { count: 1, windowStart: now } });
      return false;
    }
    return row.count > limit;
  } catch {
    return false; // fail open
  }
}

/** Is `key` already over `limit` in its current window? Reads only — doesn't count a hit. */
export async function overLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row || Date.now() - row.windowStart.getTime() > windowMs) return false;
    return row.count >= limit;
  } catch {
    return false;
  }
}

/** Best-effort cleanup of stale windows — call occasionally from a cron. */
export async function sweepRateLimits(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { count } = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return count;
}
