import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { tokenCss, defaultTokens, type OrbitDesignDoc } from "@/lib/orbit-design";
import { money } from "@/lib/money";
import { verifyOrderByToken } from "@/lib/order-verify";

export const dynamic = "force-dynamic";

export default async function VerifyOrderPage({
  params,
}: {
  params: Promise<{ businessId: string; token: string }>;
}) {
  const { businessId, token } = await params;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "http"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const order = await verifyOrderByToken(businessId, token, origin);

  // token may already be consumed — fall back to finding the order by a recently-verified match is
  // not possible, so if there's no order at all, 404; otherwise show the confirmed state.
  if (!order) {
    // maybe it was already confirmed (token cleared) — show a generic success rather than an error
    return <Shell businessId={businessId} title="Already confirmed" body="This order is already confirmed. Thank you!" />;
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, storeCurrency: true, storeDesign: { select: { doc: true } } },
  });
  let doc: OrbitDesignDoc | null = null;
  try {
    doc = business?.storeDesign?.doc ? (JSON.parse(business.storeDesign.doc) as OrbitDesignDoc) : null;
  } catch {
    doc = null;
  }
  const storeName = doc?.storeName ?? business?.name ?? "the store";

  return (
    <Shell
      businessId={businessId}
      tokens={doc?.tokens}
      title="Order confirmed 🎉"
      body={`Thanks, ${order.customerName.split(" ")[0]}. Your cash-on-delivery order #${order.id
        .slice(-6)
        .toUpperCase()} for ${money(order.total, business?.storeCurrency)} is confirmed. ${storeName} will be in touch about delivery.`}
    />
  );
}

function Shell({
  businessId,
  tokens,
  title,
  body,
}: {
  businessId: string;
  tokens?: OrbitDesignDoc["tokens"];
  title: string;
  body: string;
}) {
  const css = `${tokenCss(tokens ?? defaultTokens()).replace(":root{", "body{")}
*{box-sizing:border-box}body{margin:0;font-family:var(--od-font-body);color:var(--od-text);background:var(--od-bg);line-height:1.6}`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "80px var(--od-gutter) 96px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--od-font-heading)", fontSize: 26, margin: "0 0 10px" }}>{title}</h1>
        <p style={{ color: "var(--od-muted)" }}>{body}</p>
        <a href={`/store/${businessId}`} style={{ display: "inline-block", marginTop: 24, color: "var(--od-accent)", textDecoration: "none", fontSize: 14 }}>
          ← Back to the store
        </a>
      </div>
    </>
  );
}
