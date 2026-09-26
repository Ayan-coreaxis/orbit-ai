import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { ReturnsManager } from "@/components/store/ReturnsManager";

export default async function ReturnsPage() {
  const businessId = await getActiveBusinessId();
  const [returns, business] = businessId
    ? await Promise.all([
        prisma.returnRequest.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } }),
        prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }),
      ])
    : [[], null];

  const orders = returns.length
    ? await prisma.order.findMany({ where: { id: { in: returns.map((r) => r.orderId) } } })
    : [];

  const rows = returns.map((r) => {
    const order = orders.find((o) => o.id === r.orderId);
    return {
      id: r.id,
      orderId: r.orderId,
      reason: r.reason,
      status: r.status,
      sellerNote: r.sellerNote,
      createdAt: r.createdAt.toISOString(),
      customerName: order?.customerName ?? "(order not found)",
      total: order?.total ?? 0,
      paymentProvider: order?.paymentProvider ?? "cod",
      refundAmount: r.refundAmount,
      refundMethod: r.refundMethod,
    };
  });

  return (
    <div>
      <Topbar
        title="Returns & Disputes"
        subtitle={businessId ? `${rows.length} real return request${rows.length === 1 ? "" : "s"}` : "No business yet"}
      />
      <div className="max-w-[1000px] space-y-6 p-5 sm:p-8 lg:p-10">
        {!businessId ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
          </Card>
        ) : (
          <>
            <Card className="p-6">
              <SectionLabel>How this works</SectionLabel>
              <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
                Customers can request a real return from their real order&apos;s tracking page
                (linked at checkout and in review requests) once you&apos;ve marked it fulfilled.
                Approve, reject, or mark refunded below — nothing here is automated or fabricated.
              </p>
            </Card>
            <ReturnsManager rows={rows} currency={business?.storeCurrency} />
          </>
        )}
      </div>
    </div>
  );
}
