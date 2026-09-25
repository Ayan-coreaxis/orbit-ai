import { prisma } from "@/lib/prisma";

/**
 * Durable, cross-instance rate limiting backed by the `RateLimit` table (an in-memory Map resets
 * on every deploy and is per-instance on serverless). Fixed-window counter. Fails OPEN — if the
 * DB hiccups we let the request through rather than block real customers.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  try {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row || now - row.windowStart.getTime() > windowMs) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date(now) },
        update: { count: 1, windowStart: new Date(now) },
      });
      return false;
    }
    if (row.count >= limit) return true;
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return false;
  } catch {
    return false; // fail open
  }
}

/** Best-effort cleanup of stale windows — call occasionally from a cron. */
export async function sweepRateLimits(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { count } = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return count;
}
