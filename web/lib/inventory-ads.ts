import { prisma } from "@/lib/prisma";
import { pauseAd } from "@/lib/meta-ads";

/**
 * Inventory ↔ ads. An ad that sends people to a sold-out product burns budget on clicks nobody can
 * convert, so when the product it advertises runs out, Orbit pauses it (pausing only stops spend and
 * is reversible) and tells the owner in the Orchestrator chat. When the product is restocked the owner
 * is told too — but the ad is NOT switched back on automatically: turning spend on is the owner's call.
 */

const productIdOf = (link: string | null) => link?.match(/\/product\/([A-Za-z0-9_-]+)/)?.[1] ?? null;

async function soldOut(businessId: string, productIds: string[]): Promise<Map<string, string>> {
  const products = await prisma.product.findMany({
    where: { businessId, id: { in: productIds } },
    select: { id: true, name: true, stock: true, optionTypes: true, variants: { select: { stock: true } } },
  });
  const out = new Map<string, string>();
  for (const p of products) {
    let hasOptions = false;
    try {
      const o = JSON.parse(p.optionTypes ?? "[]");
      hasOptions = Array.isArray(o) && o.length > 0;
    } catch {}
    const available = hasOptions && p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0;
    if (!available) out.set(p.id, p.name);
  }
  return out;
}

/** Name of the product this ad advertises if that product is sold out, else null. */
export async function adProductSoldOut(ad: { businessId: string; link: string | null }): Promise<string | null> {
  const pid = productIdOf(ad.link);
  if (!pid) return null;
  return (await soldOut(ad.businessId, [pid])).get(pid) ?? null;
}

const say = (businessId: string, content: string) =>
  prisma.orchestratorMessage.create({ data: { businessId, role: "assistant", speaker: "inventory", content } }).catch(() => null);

/** Pause every running ad whose product is sold out. Returns what was paused. Safe to call often. */
export async function pauseAdsForSoldOut(businessId: string): Promise<string[]> {
  const running = await prisma.adCampaign.findMany({ where: { businessId, status: "active" } });
  const withProduct = running.map((a) => ({ a, pid: productIdOf(a.link) })).filter((x): x is { a: (typeof running)[number]; pid: string } => !!x.pid);
  if (!withProduct.length) return [];
  const gone = await soldOut(businessId, [...new Set(withProduct.map((x) => x.pid))]);
  const paused: string[] = [];
  for (const { a, pid } of withProduct) {
    const name = gone.get(pid);
    if (!name) continue;
    try {
      await pauseAd(a);
      await prisma.adCampaign.update({ where: { id: a.id }, data: { pausedReason: "sold_out" } });
      paused.push(`"${a.headline || a.name}" (${name})`);
    } catch (e) {
      await say(businessId, `${name} is sold out, but I couldn't pause the ad "${a.headline || a.name}" on Meta: ${e instanceof Error ? e.message : "unknown error"}. Pause it in Ads so it stops spending.`);
    }
  }
  if (paused.length) {
    await say(
      businessId,
      `Sold out, so I paused ${paused.length === 1 ? "the ad" : "these ads"} ${paused.join(", ")} — no more spend on clicks that can't buy. Restock it and I'll let you know; you turn the ad back on from Ads.`,
    );
  }
  return paused;
}

/** After a restock: tell the owner which of their sold-out-paused ads can go live again. */
export async function noteRestockedAds(businessId: string, productId: string): Promise<void> {
  const paused = await prisma.adCampaign.findMany({ where: { businessId, status: "paused", pausedReason: "sold_out" } });
  const mine = paused.filter((a) => productIdOf(a.link) === productId);
  if (!mine.length) return;
  if ((await soldOut(businessId, [productId])).size) return; // still nothing to sell
  await prisma.adCampaign.updateMany({ where: { id: { in: mine.map((a) => a.id) } }, data: { pausedReason: null } });
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
  await say(
    businessId,
    `${product?.name ?? "That product"} is back in stock. ${mine.length === 1 ? `The ad "${mine[0].headline || mine[0].name}" is` : `${mine.length} ads are`} still paused — turn ${mine.length === 1 ? "it" : "them"} back on in Ads when you're ready.`,
  );
}
