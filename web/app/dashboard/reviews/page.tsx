import { Topbar } from "@/components/Topbar";
import { Card, Pill } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { Star, AlertTriangle } from "lucide-react";

export default async function ReviewsPage() {
  const businessId = await getActiveBusinessId();
  const reviews = businessId
    ? await prisma.review.findMany({ where: { businessId }, orderBy: { requestedAt: "desc" } })
    : [];

  const submitted = reviews.filter((r) => r.status === "submitted" || r.status === "flagged");
  const avgRating = submitted.length > 0 ? submitted.reduce((s, r) => s + (r.rating ?? 0), 0) / submitted.length : null;
  const flagged = reviews.filter((r) => r.status === "flagged");

  return (
    <div>
      <Topbar
        title="Reviews & Reputation"
        subtitle={
          businessId
            ? `${reviews.length} real review request${reviews.length === 1 ? "" : "s"} sent · ${submitted.length} responded`
            : "No business yet"
        }
      />
      <div className="max-w-[1000px] space-y-6 p-10">
        {!businessId ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No real business yet — complete onboarding first.</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Real average rating</div>
                <div className="mt-2.5 text-2xl font-semibold">
                  {avgRating !== null ? `${avgRating.toFixed(1)} / 5` : "No ratings yet"}
                </div>
              </Card>
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Real reviews requested</div>
                <div className="mt-2.5 text-2xl font-semibold">{reviews.length}</div>
              </Card>
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Flagged (2★ or below)</div>
                <div className="mt-2.5 text-2xl font-semibold">{flagged.length}</div>
              </Card>
            </div>

            <Card className="p-6">
              <p className="text-[13px] leading-relaxed text-text-dim">
                A real review request is sent by WhatsApp automatically when you mark an order{" "}
                <b>fulfilled</b> in your Store page — real send, tracked honestly (if Twilio isn&apos;t
                connected or the send fails, it&apos;s recorded, not hidden).
              </p>
            </Card>

            <Card className="overflow-hidden">
              {reviews.length === 0 ? (
                <p className="p-6 text-[13.5px] text-text-faint">
                  No review requests yet — mark a real order fulfilled to send your first one.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {reviews.map((r) => (
                    <div key={r.id} className={"p-5" + (r.status === "flagged" ? " bg-bad-soft" : "")}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[14px] font-medium">{r.productNames}</div>
                          <div className="text-[12px] text-text-faint">{r.customerPhone}</div>
                        </div>
                        <div className="text-right">
                          {r.rating !== null ? (
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3.5 w-3.5 ${i < r.rating! ? "fill-warn text-warn" : "text-text-faint"}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <Pill tone="neutral">Awaiting response</Pill>
                          )}
                          {r.notifyError && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-bad">
                              <AlertTriangle className="h-3 w-3" /> WhatsApp send failed
                            </div>
                          )}
                        </div>
                      </div>
                      {r.comment && <p className="mt-2 text-[13px] text-text-dim">&quot;{r.comment}&quot;</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
