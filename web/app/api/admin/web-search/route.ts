import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { setKey } from "@/lib/env-file";
import { BRAVE_COST_PER_SEARCH, BRAVE_FREE_MONTHLY_USD, DEFAULT_SEARCH_LIMITS, searchConfig, searchUsageReport, testSearch } from "@/lib/web-search";

/** Super Admin > Web Search: settings, this month's usage and cost, per-seller counts. */
export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const cfg = searchConfig();
  return NextResponse.json({
    config: { configured: cfg.configured, enabled: cfg.enabled, country: cfg.country, perTurn: cfg.perTurn, limits: cfg.limits },
    defaults: DEFAULT_SEARCH_LIMITS,
    pricing: { perSearchUsd: BRAVE_COST_PER_SEARCH, freeMonthlyUsd: BRAVE_FREE_MONTHLY_USD },
    usage: await searchUsageReport(),
  });
}

/**
 * { action: "save", enabled, country, perTurn, limits: {starter, growth, scale} } — non-secret settings.
 * { action: "test", query } — one real search. The API key itself is saved via /api/admin/settings.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    query?: string;
    enabled?: boolean;
    country?: string;
    perTurn?: number;
    limits?: Record<string, number>;
  };
  if (body.action === "test") return NextResponse.json(await testSearch(body.query?.trim() || "best selling snacks in Pakistan"));
  if (body.action !== "save") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const n = (v: unknown, max: number) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) && x >= 0 && x <= max ? String(x) : null;
  };
  if (typeof body.enabled === "boolean") await setKey("web_search_enabled", body.enabled ? "true" : "false");
  if (typeof body.country === "string" && /^([a-z]{2}|all)$/i.test(body.country.trim())) await setKey("web_search_country", body.country.trim().toLowerCase());
  const perTurn = n(body.perTurn, 10);
  if (perTurn) await setKey("web_search_per_turn", perTurn);
  for (const plan of ["starter", "growth", "scale"] as const) {
    const v = n(body.limits?.[plan], 100000);
    if (v !== null) await setKey(`web_search_limit_${plan}`, v);
  }
  return NextResponse.json({ ok: true });
}
