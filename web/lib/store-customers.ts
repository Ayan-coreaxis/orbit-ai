import { prisma } from "@/lib/prisma";

/**
 * The seller's customer list, aggregated from real orders (by phone) and linked to a
 * `StoreCustomer` account where one exists. Every number is straight from `Order` rows.
 */

export type Segment = "new" | "repeat" | "vip" | "at_risk";

export interface CustomerSummary {
  phone: string;
  name: string;
  email: string | null;
  hasAccount: boolean;
  orders: number;
  spent: number;
  aov: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastStatus: string;
  segment: Segment;
}

const DAY = 24 * 60 * 60 * 1000;

export async function getStoreCustomers(businessId: string): Promise<{ customers: CustomerSummary[]; counts: Record<Segment, number> }> {
  const [orders, accounts] = await Promise.all([
    prisma.order.findMany({
      where: { businessId, status: { not: "cancelled" }, verified: true },
      select: { customerPhone: true, customerName: true, customerEmail: true, total: true, createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.storeCustomer.findMany({ where: { businessId }, select: { phone: true, email: true, name: true } }),
  ]);

  const acctByPhone = new Map(accounts.filter((a) => a.phone).map((a) => [a.phone!.replace(/\D/g, "").slice(-10), a]));

  const byPhone = new Map<string, CustomerSummary & { _spend: number }>();
  for (const o of orders) {
    const key = (o.customerPhone || "").replace(/\D/g, "").slice(-10) || o.customerPhone;
    if (!key) continue;
    const acct = acctByPhone.get(key);
    const cur =
      byPhone.get(key) ??
      ({
        phone: o.customerPhone,
        name: acct?.name || o.customerName,
        email: acct?.email || o.customerEmail,
        hasAccount: !!acct,
        orders: 0,
        spent: 0,
        aov: 0,
        firstOrderAt: o.createdAt.toISOString(),
        lastOrderAt: o.createdAt.toISOString(),
        lastStatus: o.status,
        segment: "new" as Segment,
        _spend: 0,
      } as CustomerSummary & { _spend: number });
    cur.orders += 1;
    cur._spend += o.total;
    cur.lastOrderAt = o.createdAt.toISOString();
    cur.lastStatus = o.status;
    if (!cur.email && o.customerEmail) cur.email = o.customerEmail;
    byPhone.set(key, cur);
  }

  const now = Date.now();
  const list: CustomerSummary[] = [...byPhone.values()].map((c) => {
    c.spent = Math.round(c._spend * 100) / 100;
    c.aov = c.orders ? Math.round((c._spend / c.orders) * 100) / 100 : 0;
    const daysSince = (now - new Date(c.lastOrderAt).getTime()) / DAY;
    let segment: Segment = "new";
    if (c.orders >= 4) segment = "vip";
    else if (c.orders >= 2) segment = "repeat";
    if (c.orders >= 2 && daysSince > 60) segment = "at_risk";
    c.segment = segment;
    return c;
  });

  list.sort((a, b) => b.spent - a.spent);

  const counts: Record<Segment, number> = { new: 0, repeat: 0, vip: 0, at_risk: 0 };
  for (const c of list) counts[c.segment] += 1;

  return { customers: list, counts };
}
