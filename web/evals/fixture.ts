import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { defaultDoc } from "../lib/orbit-design";

/**
 * "Shifa Herbals" — a fixed, fake herbal-medicine store in Lahore (PKR, COD) that every eval run
 * starts from. Rebuilt from scratch each run so scores are comparable run to run. The expected
 * answers in cases.ts are written against exactly this data.
 */

export const EVAL_EMAIL = "eval@orbit.local";

type P = { name: string; price: number; cost?: number; stock: number; photo?: boolean; desc?: string; variants?: { size: string; price: number; stock: number }[] };

export const PRODUCTS: P[] = [
  { name: "Kalonji Oil 100ml", price: 650, cost: 300, stock: 40, photo: true, desc: "Cold-pressed black seed oil." },
  { name: "Ashwagandha Capsules (60)", price: 1200, cost: 550, stock: 0, photo: true },
  { name: "Moringa Powder 200g", price: 800, cost: 350, stock: 3, photo: true },
  { name: "Sidr Honey", price: 1500, cost: 900, stock: 0, photo: true, variants: [{ size: "250g", price: 1500, stock: 10 }, { size: "500g", price: 2800, stock: 0 }] },
  { name: "Joshanda (10 sachets)", price: 250, cost: 100, stock: 100, photo: true },
  { name: "Arq-e-Gulab 300ml", price: 300, cost: 120, stock: 25 },
  { name: "Methi Dana Powder 200g", price: 350, cost: 150, stock: 12, photo: true },
  { name: "Amla Reetha Hair Oil 200ml", price: 900, cost: 400, stock: 0, photo: true },
  { name: "Isabgol Husk 200g", price: 450, cost: 200, stock: 30, photo: true },
  { name: "Qust-e-Hindi Powder 100g", price: 1100, cost: 500, stock: 5, photo: true },
  { name: "Neem Leaf Powder 100g", price: 400, cost: 150, stock: 18, photo: true },
  { name: "Triphala Churan 200g", price: 700, cost: 300, stock: 22, photo: true },
  { name: "Saunf Arq 500ml", price: 350, cost: 140, stock: 9, photo: true },
  { name: "Shilajit Resin 20g", price: 3500, cost: 1800, stock: 7, photo: true },
  { name: "Turmeric Capsules (90)", price: 1400, cost: 600, stock: 14, photo: true },
  { name: "Olive Oil 250ml", price: 1100, stock: 20, photo: true },
  { name: "Habbat-us-Sauda Capsules (60)", price: 950, cost: 420, stock: 0 },
  { name: "Mulethi Powder 100g", price: 380, cost: 160, stock: 16, photo: true },
  { name: "Aloe Vera Gel 150ml", price: 600, cost: 250, stock: 2, photo: true },
  { name: "Senna Leaves 100g", price: 300, cost: 110, stock: 11, photo: true },
  { name: "Castor Oil 100ml", price: 450, cost: 180, stock: 26, photo: true },
  { name: "Dry Ginger Powder 100g", price: 320, cost: 130, stock: 19, photo: true },
];

export type Fixture = { businessId: string; email: string; password: string; revenue: number };

export async function buildFixture(): Promise<Fixture> {
  // wipe the previous run's store
  const old = await prisma.user.findUnique({ where: { email: EVAL_EMAIL } });
  if (old) {
    await prisma.business.deleteMany({ where: { ownerId: old.id } });
    await prisma.user.delete({ where: { id: old.id } });
  }

  const password = randomBytes(12).toString("hex");
  const user = await prisma.user.create({ data: { email: EVAL_EMAIL, passwordHash: await bcrypt.hash(password, 10) } });
  const b = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: "Shifa Herbals",
      niche: "herbal remedies and natural health products",
      website: null,
      whatsapp: "+923001234567",
      storeCurrency: "pkr",
      plan: "growth",
      monthlyUsageCapUsd: 100,
      shippingFee: 250,
      freeShippingOver: 3000,
      chatWidgetEnabled: true,
      onboardingAnswers: JSON.stringify([
        { question: "Who buys from you most?", answer: "Women 25-45 in Lahore buying for family health" },
        { question: "What matters most right now?", answer: "Get first 50 online orders" },
      ]),
    },
  });

  // products — created one by one so createdAt order (= P1, P2… refs) is exactly this list
  for (const p of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        businessId: b.id,
        name: p.name,
        price: p.price,
        costPrice: p.cost ?? null,
        stock: p.stock,
        description: p.desc ?? null,
        imageUrl: p.photo ? `https://example.com/eval/${encodeURIComponent(p.name)}.jpg` : null,
        optionTypes: p.variants ? JSON.stringify([{ name: "Size", values: p.variants.map((v) => v.size) }]) : null,
      },
    });
    for (const v of p.variants ?? [])
      await prisma.productVariant.create({ data: { productId: created.id, label: v.size, options: JSON.stringify({ Size: v.size }), price: v.price, stock: v.stock } });
    await new Promise((r) => setTimeout(r, 5));
  }

  await prisma.shippingZone.create({ data: { businessId: b.id, name: "Lahore", cities: JSON.stringify(["Lahore"]), fee: 150, freeOver: null, priority: 0 } });
  await prisma.coupon.create({ data: { businessId: b.id, code: "SHIFA10", type: "percent", value: 10, minSubtotal: 1500 } });

  const order = (name: string, phone: string, city: string, items: { name: string; qty: number; price: number }[], ship: number, status: string, daysAgo: number) => {
    const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
    return prisma.order.create({
      data: {
        businessId: b.id,
        customerName: name,
        customerPhone: phone,
        address: `House 1, ${city}`,
        shippingAddress: JSON.stringify({ name, phone, line1: "House 1", city }),
        items: JSON.stringify(items.map((i) => ({ productId: "x", name: i.name, qty: i.qty, price: i.price }))),
        subtotal,
        shippingFee: ship,
        total: subtotal + ship,
        status,
        paymentProvider: "cod",
        paymentStatus: status === "fulfilled" ? "paid" : "pending",
        verified: true,
        createdAt: new Date(Date.now() - daysAgo * 86400000),
      },
    });
  };
  await order("Ayesha Khan", "03011112222", "Lahore", [{ name: "Kalonji Oil 100ml", qty: 2, price: 650 }], 150, "pending", 1); // 1450
  await order("Bilal Ahmed", "03213334444", "Karachi", [{ name: "Joshanda (10 sachets)", qty: 3, price: 250 }], 250, "fulfilled", 4); // 1000
  await order("Hina Malik", "03335556666", "Lahore", [{ name: "Shilajit Resin 20g", qty: 1, price: 3500 }], 0, "cancelled", 2); // 3500, cancelled
  await order("Usman Tariq", "03457778888", "Faisalabad", [{ name: "Moringa Powder 200g", qty: 1, price: 800 }, { name: "Isabgol Husk 200g", qty: 1, price: 450 }], 250, "shipped", 3); // 1500

  // a published default storefront, so the store chatbot behaves like a live store
  await prisma.storeDesign.create({ data: { businessId: b.id, doc: JSON.stringify(defaultDoc("Shifa Herbals", "herbal remedies")), published: true } });

  return { businessId: b.id, email: EVAL_EMAIL, password, revenue: 1450 + 1000 + 1500 };
}

/** Prices + stock of every product and variant — must be identical before and after a case (nothing changes without Apply). */
export async function storeSnapshot(businessId: string): Promise<string> {
  const ps = await prisma.product.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, include: { variants: { orderBy: { label: "asc" } } } });
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { shippingFee: true, freeShippingOver: true, storeCurrency: true, taxRatePercent: true } });
  return JSON.stringify([b, ps.map((p) => [p.name, p.price, p.stock, p.costPrice, p.variants.map((v) => [v.label, v.price, v.stock])])]);
}
