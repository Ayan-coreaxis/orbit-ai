import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { findTasks, briefingIntro, OCCASIONS, type Snapshot, type ProductSnap } from "./daily-briefing";

const NOW = new Date("2026-11-12T05:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

const product = (p: Partial<ProductSnap> & { id: string }): ProductSnap => ({
  name: p.id,
  stock: 20,
  hasImage: true,
  galleryCount: 2,
  descriptionLength: 200,
  ...p,
});

const base = (over: Partial<Snapshot> = {}): Snapshot => ({
  now: NOW,
  currency: "pkr",
  published: true,
  products: [product({ id: "a" }), product({ id: "b" })],
  orders: [],
  abandoned: [],
  events: [],
  activeCoupons: 1,
  skipped: [],
  ...over,
});

describe("daily store check", () => {
  it("a healthy quiet store gets no tasks, apart from a near occasion", () => {
    const t = findTasks(base());
    expect(t.every((x) => x.kind === "occasion")).toBe(true);
  });

  it("an unpublished store with products comes first", () => {
    const t = findTasks(base({ published: false, products: [product({ id: "a", hasImage: false })] }));
    expect(t[0].id).toBe("publish");
  });

  it("flags COD orders waiting more than 12 hours, with their real value", () => {
    const t = findTasks(
      base({
        orders: [
          { status: "pending", total: 2205, createdAt: hoursAgo(20), confirmedAt: null, items: [] },
          { status: "pending", total: 1000, createdAt: hoursAgo(2), confirmedAt: null, items: [] },
        ],
      }),
    );
    const p = t.find((x) => x.id === "pending-orders")!;
    expect(p.title).toContain("1 order");
    expect(p.why).toContain("2,205");
  });

  it("finds a bestseller running out from real sales", () => {
    const t = findTasks(
      base({
        products: [product({ id: "serum", name: "Vitamin C Serum", stock: 2 }), product({ id: "b", stock: 1 })],
        orders: [
          { status: "fulfilled", total: 5000, createdAt: daysAgo(5), confirmedAt: daysAgo(5), items: [{ productId: "serum", qty: 4 }] },
          { status: "confirmed", total: 2500, createdAt: daysAgo(2), confirmedAt: daysAgo(2), items: [{ productId: "serum", qty: 2 }] },
        ],
      }),
    );
    const r = t.find((x) => x.kind === "stock")!;
    expect(r.title).toContain("Vitamin C Serum");
    expect(r.why).toContain("6 sold");
    // "b" never sold — low stock alone is not a bestseller task
    expect(t.some((x) => x.id === "restock-b")).toBe(false);
  });

  it("spots a real sales dip week over week", () => {
    const orders = [
      ...[8, 9, 10, 11].map((d) => ({ status: "fulfilled", total: 3000, createdAt: daysAgo(d), confirmedAt: daysAgo(d), items: [] })),
      { status: "fulfilled", total: 2000, createdAt: daysAgo(2), confirmedAt: daysAgo(2), items: [] },
    ];
    const t = findTasks(base({ orders }));
    const dip = t.find((x) => x.id === "sales-dip")!;
    expect(dip.title).toContain("83%");
  });

  it("checkout drop-off needs enough real events", () => {
    const ev = (type: string, n: number) => Array.from({ length: n }, () => ({ type, createdAt: daysAgo(1) }));
    expect(findTasks(base({ events: [...ev("checkout_start", 4), ...ev("order_complete", 0)] })).some((x) => x.id === "checkout-dropoff")).toBe(false);
    expect(findTasks(base({ events: [...ev("checkout_start", 10), ...ev("order_complete", 2)] })).some((x) => x.id === "checkout-dropoff")).toBe(true);
  });

  it("skipped tasks stay hidden and the list is capped at 5, highest impact first", () => {
    const s = base({
      published: false,
      products: Array.from({ length: 6 }, (_, i) => product({ id: `p${i}`, hasImage: i > 2, galleryCount: 0, descriptionLength: 10 })),
      orders: [{ status: "pending", total: 900, createdAt: hoursAgo(30), confirmedAt: null, items: [] }],
      abandoned: [{ total: 1000, createdAt: daysAgo(1) }, { total: 500, createdAt: daysAgo(1) }],
      activeCoupons: 0,
      skipped: ["no-photos"],
    });
    const t = findTasks(s);
    expect(t.length).toBeLessThanOrEqual(5);
    expect(t.some((x) => x.id === "no-photos")).toBe(false);
    for (let i = 1; i < t.length; i++) expect(t[i - 1].impact).toBeGreaterThanOrEqual(t[i].impact);
  });

  it("suggests the next occasion inside 3 weeks only", () => {
    const t = findTasks(base());
    const occ = t.find((x) => x.kind === "occasion");
    expect(occ?.id).toBe("occasion-black-friday-2026"); // 15 days after 12 Nov 2026
    const far = findTasks(base({ now: new Date("2026-06-01T05:00:00Z") }));
    expect(far.some((x) => x.kind === "occasion")).toBe(false);
  });

  it("speaks Roman Urdu when the owner does", () => {
    const t = findTasks(base({ published: false }), "ur");
    expect(t[0].title).toContain("live nahi");
    expect(briefingIntro(t, "ur")).toContain("Subah bakhair");
    expect(briefingIntro([], "en")).toContain("nothing needs you");
  });

  it("occasion dates are valid and in order", () => {
    for (const o of OCCASIONS) expect(Number.isNaN(new Date(o.date).getTime())).toBe(false);
  });
});
