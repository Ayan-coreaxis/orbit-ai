import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { getBusinessSummary } from "@/lib/get-business";
import { getRealFinance } from "@/lib/get-real-finance";
import { RevenueChart } from "@/components/RevenueChart";
import { CircleDollarSign, TrendingUp } from "lucide-react";

export default async function FinancePage() {
  const real = await getBusinessSummary();
  const finance = real ? await getRealFinance(real.businessId) : null;

  return (
    <div>
      <Topbar title="How Your Store Is Doing" subtitle="Revenue and margin from your own orders — never estimated" />
      <div className="max-w-[1200px] space-y-6 p-5 sm:p-8 lg:p-10">
        {!real || !finance ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">
              No real business yet — complete onboarding to see real revenue here.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Revenue, last 7 days</div>
                <div className="mt-2.5 text-2xl font-semibold">Rs {finance.revenueLast7Days.toLocaleString()}</div>
              </Card>
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Orders, last 7 days</div>
                <div className="mt-2.5 text-2xl font-semibold">{finance.ordersLast7Days}</div>
              </Card>
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Gross profit, last 7 days</div>
                {finance.realGrossProfitLast7Days !== null ? (
                  <>
                    <div className="mt-2.5 flex items-center gap-2 text-2xl font-semibold">
                      <TrendingUp className="h-5 w-5 text-good" />
                      Rs {finance.realGrossProfitLast7Days.toLocaleString()}
                    </div>
                    {finance.costCoverageRatio < 0.99 && (
                      <div className="mt-1.5 text-[11.5px] text-text-faint">
                        Based on {(finance.costCoverageRatio * 100).toFixed(0)}% of revenue — the rest is
                        from products with no real cost price on file yet.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2.5 text-[13px] text-text-faint">
                    No real cost prices on file yet.{" "}
                    <Link href="/dashboard" className="underline">
                      Add one on a product
                    </Link>{" "}
                    to see real margin.
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-7">
              <SectionLabel>Revenue, last 7 days</SectionLabel>
              <div className="mt-4">
                <RevenueChart data={finance.dailyRevenue} />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-3">
                <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" />
                <div>
                  <p className="text-[13px] leading-relaxed text-text-dim">
                    Gross profit here is revenue minus the real cost price you enter per product — it&apos;s
                    real, not estimated, but only as complete as the cost prices you&apos;ve filled in.
                    Ad spend and cost-per-customer still aren&apos;t shown — no ad spend is actually being
                    tracked anywhere in the platform yet.
                  </p>
                  {finance.costCoverageRatio < 0.99 && (
                    <Pill tone="warn">
                      Add real cost prices in Store → Products for a complete number
                    </Pill>
                  )}
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
