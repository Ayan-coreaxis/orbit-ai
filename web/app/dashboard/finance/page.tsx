import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { getBusinessSummary } from "@/lib/get-business";
import { getRealFinance } from "@/lib/get-real-finance";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { RevenueChart } from "@/components/RevenueChart";
import { CircleDollarSign, TrendingUp } from "lucide-react";

export default async function FinancePage() {
  const real = await getBusinessSummary();
  const finance = real ? await getRealFinance(real.businessId) : null;
  const currency = real
    ? ((await prisma.business.findUnique({ where: { id: real.businessId }, select: { storeCurrency: true } }))?.storeCurrency ?? "pkr")
    : "pkr";

  return (
    <div>
      <Topbar title="Money" subtitle="Sales and profit from your real orders" />
      <div className="page-body space-y-6">
        {!real || !finance ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">
              No real business yet — complete onboarding to see real revenue here.
            </p>
          </Card>
        ) : (
          <>
            <div className="orbit-stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="hover-lift rounded-[26px] bg-tomato p-6 text-white shadow-[0_18px_40px_-18px_var(--tomato)]">
                <div className="text-[14px] font-medium text-white/85">Sales · last 7 days</div>
                <div className="mt-3 text-[34px] font-semibold leading-none tracking-tight">{money(finance.revenueLast7Days, currency)}</div>
              </div>
              <Card className="hover-lift p-6">
                <div className="text-[14px] font-medium text-text-dim">Orders · last 7 days</div>
                <div className="mt-3 text-[34px] font-semibold leading-none tracking-tight">{finance.ordersLast7Days}</div>
              </Card>
              <Card className="hover-lift p-6">
                <div className="text-[14px] font-medium text-text-dim">Profit · last 7 days</div>
                {finance.realGrossProfitLast7Days !== null ? (
                  <>
                    <div className="mt-3 flex items-center gap-2 text-[34px] font-semibold leading-none tracking-tight">
                      {money(finance.realGrossProfitLast7Days, currency)}
                      <TrendingUp className="h-5 w-5 text-good" />
                    </div>
                    {finance.costCoverageRatio < 0.99 && (
                      <div className="mt-2 text-[13px] text-text-faint">
                        From {(finance.costCoverageRatio * 100).toFixed(0)}% of sales — some products have no cost price yet.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3">
                    <div className="text-[15px] text-text-dim">Add your cost prices to see profit.</div>
                    <Link href="/dashboard/store#products" className="btn-soft mt-3 !py-2 text-[13.5px]">
                      Add cost prices
                    </Link>
                  </div>
                )}
              </Card>
            </div>

            {finance.dailyRevenue.some((d) => d.revenue > 0) ? (
              <Card className="p-7">
                <h2 className="text-[19px] font-semibold tracking-tight">Sales, day by day</h2>
                <p className="mt-1 text-[14px] text-text-faint">The last 7 days</p>
                <div className="mt-5">
                  <RevenueChart data={finance.dailyRevenue} currency={currency} />
                </div>
              </Card>
            ) : (
              <EmptyState
                icon={CircleDollarSign}
                title="No sales in the last 7 days"
                body="Your day-by-day chart appears here with the next order."
                action={{ label: "Ask Orbit how to get sales", href: "/dashboard/orchestrator" }}
                compact
              />
            )}

            <p className="flex items-center gap-2 px-1 text-[13.5px] text-text-faint">
              <CircleDollarSign className="h-4 w-4" />
              Profit = sales minus the cost price you enter for each product. Ad spend is not included yet.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
