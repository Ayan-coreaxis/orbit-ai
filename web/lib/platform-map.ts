import { prisma } from "@/lib/prisma";
import { parseOptionTypes } from "@/lib/variants";
import type { OrbitDesignDoc } from "@/lib/orbit-design";

/**
 * What the Orchestrator knows about Orbit itself: where everything lives in the dashboard (so it
 * sends the owner to the right place, not an invented menu) and the store's real launch state
 * (built? published? pages? connected? what's missing?).
 */

export const PLATFORM_MAP = `
ORBIT DASHBOARD — where things are (send the owner to these exact places; never invent a menu):
- Overview: the day's numbers and the active growth plan.
- Orchestrator (this chat): plan, discuss, and ask you to change the store. The growth plan sits on the right.
- Store → tabs: Products (add/edit products, photos, variants), Storefront (publish status + quick store controls), Orders, Customers, Discounts (coupons, loyalty points, referrals, gift cards, bundles), Analytics, Messages (form submissions from the store).
- Orbit Design: the store builder — design / redesign pages, add pages, edit text & images, logo, colours, fonts; Publish button makes the store live.
- Media: every photo / video / voice note / PDF the owner gave Orbit.
- Content: posts the AI writes. Ads: Meta campaigns (created paused). Inbox: customer messages.
- Money: real revenue & margins. Tax: tax owed. Returns: returns & disputes. Reviews: product reviews. Experiments: A/B tests. Competitors: competitor scans.
- Connections (Settings → Connections & Skills): MCP connectors, skills and plugins for agents.
- Settings & Billing: Facebook/Instagram connect, Payment method (COD / Stripe) + store currency, Delivery fee / free-delivery / tax (store operations), Shipping zones, Chat widget & checkout extra fields, Team, plan & usage.`;

type Doc = Pick<OrbitDesignDoc, "storeName" | "tagline" | "content" | "pages">;

export async function storeStatusContext(businessId: string): Promise<string> {
  const [b, design, products, zones] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        paymentProvider: true,
        stripeSecretKey: true,
        storeCurrency: true,
        shippingFee: true,
        metaPageId: true,
        metaInstagramUserId: true,
        metaAdAccountId: true,
        whatsappInboundNumber: true,
        checkoutCustomFields: true,
      },
    }),
    prisma.storeDesign.findUnique({ where: { businessId }, select: { doc: true, published: true, backendWiredAt: true, updatedAt: true } }),
    prisma.product.findMany({ where: { businessId }, select: { price: true, imageUrl: true, description: true, stock: true, optionTypes: true } }),
    prisma.shippingZone.count({ where: { businessId } }).catch(() => 0),
  ]);
  if (!b) return "";

  let doc: Doc | null = null;
  try {
    doc = design?.doc ? (JSON.parse(design.doc) as Doc) : null;
  } catch {
    doc = null;
  }
  const pages = doc?.pages ?? [];
  const hasSections = pages.some((p) => p.sections?.length);
  const built = !!doc && hasSections;
  const content = doc?.content;
  const hasPolicy = (re: RegExp) => pages.some((p) => re.test(`${p.slug} ${p.title}`));

  const missing: string[] = [];
  if (!built) missing.push("the store hasn't been designed yet (Orbit Design)");
  else if (!design?.published) missing.push("the store isn't published — customers can't open it");
  if (!products.length) missing.push("no products");
  const zeroPrice = products.filter((p) => !(p.price > 0) && !parseOptionTypes(p.optionTypes).length).length;
  if (zeroPrice) missing.push(`${zeroPrice} product(s) with price 0`);
  const noPhoto = products.filter((p) => !p.imageUrl).length;
  if (noPhoto) missing.push(`${noPhoto} product(s) without a photo`);
  const noDesc = products.filter((p) => !p.description?.trim()).length;
  if (noDesc) missing.push(`${noDesc} product(s) without a description`);
  if (built && !content?.logoUrl) missing.push("no logo on the store");
  if (built && !content?.contactPhone && !content?.contactEmail) missing.push("no contact phone/email on the store");
  if (built && !hasPolicy(/return|refund/i)) missing.push("no returns/refund policy page");
  if (built && !hasPolicy(/shipping|delivery/i)) missing.push("no shipping/delivery info page");
  if (!b.whatsappInboundNumber) missing.push("WhatsApp not connected");

  const lines = [
    `- Store design: ${built ? `built — ${pages.length} pages: ${pages.map((p) => `${p.title} (/${p.slug === "home" ? "" : p.slug})`).join(", ")}` : "not designed yet"}`,
    `- Live: ${design?.published ? `YES — /store/${businessId}` : "NO (draft only)"}${design?.published && design.backendWiredAt && design.updatedAt > design.backendWiredAt ? " — design edited since last publish; publish again to push everything live" : ""}`,
    built ? `- Brand on the store: name "${doc?.storeName}", tagline "${doc?.tagline}", logo ${content?.logoUrl ? "set" : "missing"}, announcement bar ${content?.announcement?.enabled ? `"${content.announcement.text}"` : "off"}, contact ${[content?.contactPhone, content?.contactEmail].filter(Boolean).join(" / ") || "missing"}, socials ${Object.entries(content?.socials ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}` : "",
    `- Products: ${products.length} (${products.filter((p) => p.imageUrl).length} with photos)`,
    `- Payments: ${b.paymentProvider === "stripe" ? (b.stripeSecretKey ? "Stripe (connected)" : "Stripe selected but keys missing") : "Cash on delivery"}; currency ${(b.storeCurrency || "usd").toUpperCase()}; delivery fee ${b.shippingFee}; ${zones} shipping zone(s)`,
    `- Connected: Facebook ${b.metaPageId ? "yes" : "no"}, Instagram ${b.metaInstagramUserId ? "yes" : "no"}, Ad account ${b.metaAdAccountId ? "yes" : "no"}, WhatsApp ${b.whatsappInboundNumber ? "yes" : "no"}`,
    missing.length ? `- NOT READY YET: ${missing.join("; ")}` : "- Launch checklist: all basics in place.",
  ].filter(Boolean);

  return `
STORE STATUS (live, from the database)
${lines.join("\n")}
You CAN change the storefront itself with store_design (Orbit Design does it after the owner's Apply) — design or redesign pages, add pages (About, FAQ, returns policy…), change text/images/colours, and publish. Point out launch blockers from NOT READY YET when relevant, most important first — but don't nag about them in every reply.`;
}
