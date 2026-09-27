import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { FINANCE_PERIODS, getFinance, type FinancePeriod } from "@/lib/admin-finance";

const cell = (v: string | number | null) => {
  const s = v === null ? "" : typeof v === "number" ? v.toFixed(4) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Per-seller profit & loss for a period, as CSV (for a spreadsheet). */
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("period");
  const period: FinancePeriod = FINANCE_PERIODS.some((p) => p.id === raw) ? (raw as FinancePeriod) : "mtd";
  const { sellers } = await getFinance(period);
  const header = ["seller", "plan", "revenue_usd", "claude_usd", "web_search_usd", "studio_images_usd", "studio_video_usd", "payment_fees_usd", "total_cost_usd", "profit_usd", "margin_pct"];
  const lines = sellers.map((s) =>
    [s.name, s.plan, s.revenue, s.costs.claude, s.costs.search, s.costs.images, s.costs.video, s.costs.fees, s.totalCost, s.profit, s.margin === null ? null : Number(s.margin.toFixed(1))].map(cell).join(","),
  );
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orbit-pnl-${period}.csv"` },
  });
}
