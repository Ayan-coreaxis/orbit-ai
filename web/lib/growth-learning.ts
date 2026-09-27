import { prisma } from "@/lib/prisma";
import { measureStrategy, parseMetric } from "@/lib/strategy-lab";
import { nichesOf, stageOf, type Niche } from "@/lib/growth-playbook";

/**
 * What Orbit has LEARNED from real results: every strategy that has actually run on any Orbit
 * store is measured by code (lib/strategy-lab measureStrategy) and counted as worked / didn't —
 * grouped by kind of strategy, niche and stage. The planner sees these numbers (anonymised: never
 * a store name, customer or exact revenue) so a tactic that keeps failing for herbal stores stops
 * being suggested, and one that keeps working gets tried first. Grows by itself as sellers use it.
 */

type Outcome = { kind: string; niches: Niche[]; stage: string; title: string; worked: boolean; lift: string };

let cache: { at: number; rows: Outcome[] } | null = null;
const TTL = 60 * 60 * 1000;

async function outcomes(): Promise<Outcome[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const strategies = await prisma.strategy.findMany({
    where: { startedAt: { not: null, gte: new Date(Date.now() - 365 * 86400000) }, status: { in: ["running", "paused", "stopped", "done"] } },
    orderBy: { startedAt: "desc" },
    take: 300,
    select: {
      title: true,
      kind: true,
      metric: true,
      startedAt: true,
      endedAt: true,
      durationDays: true,
      businessId: true,
      plan: { select: { snapshot: true } },
    },
  });
  const niches = new Map<string, Niche[]>();
  const rows: Outcome[] = [];
  for (const s of strategies) {
    if (parseMetric(s.metric).type === "manual") continue;
    // judge only after it had a fair chance: 7+ days, or its planned duration is over
    const ranDays = ((s.endedAt ?? new Date()).getTime() - s.startedAt!.getTime()) / 86400000;
    if (ranDays < Math.min(7, s.durationDays ?? 7)) continue;
    const r = await measureStrategy(s.businessId, s).catch(() => null);
    if (!r?.measurable || r.value == null) continue;
    const lowerIsBetter = parseMetric(s.metric).type === "cancel_rate";
    const worked =
      r.target != null
        ? lowerIsBetter ? r.value <= r.target : r.value >= r.target
        : r.baseline != null
          ? lowerIsBetter ? r.value < r.baseline : r.value > r.baseline
          : r.value > 0;
    if (!niches.has(s.businessId)) {
      const b = await prisma.business.findUnique({ where: { id: s.businessId }, select: { niche: true, products: { select: { name: true }, take: 20 } } });
      niches.set(s.businessId, b ? nichesOf(b.niche, b.products.map((p) => p.name)) : ["any"]);
    }
    let stage = "unknown";
    try {
      const snap = JSON.parse(s.plan.snapshot ?? "{}");
      if (snap?.last30) stage = stageOf(snap);
    } catch {
      /* ignore */
    }
    const lift = r.baseline != null ? `${r.baseline} → ${r.value}` : `${r.value}${r.target != null ? ` (target ${r.target})` : ""}`;
    rows.push({ kind: s.kind, niches: niches.get(s.businessId)!, stage, title: s.title, worked, lift });
  }
  cache = { at: Date.now(), rows };
  return rows;
}

/** A prompt block with Orbit's own measured results — the most relevant ones for this store. Empty until there's data. */
export async function learnedOutcomesFor(businessId: string, niches: Niche[], stage: string): Promise<string> {
  const all = (await outcomes()).filter((o) => o);
  if (all.length < 3) return "";
  const own = await prisma.strategy.findMany({ where: { businessId, startedAt: { not: null } }, select: { title: true } });
  const ownTitles = new Set(own.map((o) => o.title));

  const byKind = new Map<string, { worked: number; total: number; similar: number; similarWorked: number }>();
  for (const o of all) {
    const k = byKind.get(o.kind) ?? { worked: 0, total: 0, similar: 0, similarWorked: 0 };
    k.total++;
    if (o.worked) k.worked++;
    if (o.niches.some((n) => niches.includes(n)) || o.stage === stage) {
      k.similar++;
      if (o.worked) k.similarWorked++;
    }
    byKind.set(o.kind, k);
  }
  const examples = all
    .filter((o) => o.worked && !ownTitles.has(o.title) && (o.niches.some((n) => niches.includes(n)) || o.stage === stage))
    .slice(0, 6);

  return `ORBIT'S OWN RESULTS — measured by code on real Orbit stores (anonymised). Real evidence: lean towards kinds that work for similar stores, be careful with kinds that keep failing, but small samples can mislead:
${[...byKind]
  .sort((a, b) => b[1].total - a[1].total)
  .map(([kind, k]) => `- ${kind}: worked ${k.worked}/${k.total}${k.similar ? ` · for similar stores (${niches.join("/")}, ${stage.replace("_", " ")}) ${k.similarWorked}/${k.similar}` : ""}`)
  .join("\n")}${examples.length ? `\nStrategies that worked for similar stores (adapt, don't copy):\n${examples.map((e) => `- [${e.kind}] "${e.title}" — ${e.lift}`).join("\n")}` : ""}`;
}
