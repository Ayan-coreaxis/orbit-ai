import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  business: { findUnique: vi.fn() },
  order: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const {
  scoreSignals,
  checkPkPhone,
  normalizePkPhone,
  phoneVariants,
  checkAddress,
  tallyHistory,
  levelFor,
  parseRiskSignals,
  networkPhoneHistory,
  screenOrder,
  RISK_WEIGHTS,
} = await import("./fraud");
type RiskFacts = import("./fraud").RiskFacts;

const NONE = { cancelled: 0, returned: 0, delivered: 0, total: 0 };

/** A perfectly ordinary order: real phone, full address, nothing in its history. */
function facts(over: Partial<RiskFacts> = {}): RiskFacts {
  return {
    pakistan: true,
    blocklisted: false,
    phone: "03214567890",
    store: NONE,
    network: NONE,
    ordersLast24h: 0,
    address: { line1: "House 12, Street 4, Block C", area: "Gulberg", city: "Lahore", structured: true },
    subtotal: 2000,
    storeAverage: 1800,
    maxLineQty: 1,
    ...over,
  };
}

describe("Pakistani phone numbers", () => {
  it("normalises every common spelling to 03xxxxxxxxx", () => {
    for (const p of ["03214567890", "+923214567890", "923214567890", "00923214567890", "3214567890", "0321-4567890", "+92 321 456 7890"])
      expect(normalizePkPhone(p)).toBe("03214567890");
  });

  it("rejects numbers that aren't a Pakistani mobile", () => {
    for (const p of ["", "12345", "0421234567", "032145678901", "04214567890", "+14155550123"]) expect(checkPkPhone(p)).toBe("invalid");
  });

  it("spots obviously made-up numbers", () => {
    for (const p of ["03000000000", "03000000001", "03001111111", "03333333333", "03001234567", "+923001234567", "03123456789"])
      expect(checkPkPhone(p)).toBe("fake");
  });

  it("accepts a normal number", () => {
    expect(checkPkPhone("03214567890")).toBe("ok");
    expect(checkPkPhone("+92 345 9081726")).toBe("ok");
  });

  it("lists the spellings a phone may be stored under", () => {
    const v = phoneVariants("+92 321 4567890");
    expect(v).toEqual(expect.arrayContaining(["03214567890", "+923214567890", "923214567890", "+92 321 4567890"]));
    expect(phoneVariants("")).toEqual([]);
  });
});

describe("address quality", () => {
  it("passes a full structured address", () => {
    expect(checkAddress({ line1: "House 12, Street 4", area: "Model Town", city: "lhr", structured: true })).toEqual({
      tooShort: false,
      noLocality: false,
      cityMissing: false,
      cityUnknown: false,
    });
  });

  it("flags a very short address", () => {
    expect(checkAddress({ line1: "ghar", city: "Lahore", structured: true }).tooShort).toBe(true);
  });

  it("flags an address with no house, street, block, sector or area", () => {
    expect(checkAddress({ line1: "mera ghar wahan hai", city: "Lahore", structured: true }).noLocality).toBe(true);
    expect(checkAddress({ line1: "mera ghar wahan hai", area: "Johar Town", city: "Lahore", structured: true }).noLocality).toBe(false);
    expect(checkAddress({ line1: "Sector G-9 markaz", city: "Islamabad", structured: true }).noLocality).toBe(false);
  });

  it("flags a missing city and a city it doesn't know", () => {
    expect(checkAddress({ line1: "House 12, Street 4", city: " ", structured: true }).cityMissing).toBe(true);
    expect(checkAddress({ line1: "House 12, Street 4", city: "Asdfgh", structured: true }).cityUnknown).toBe(true);
    expect(checkAddress({ line1: "House 12, Street 4", city: "Pindi", structured: true }).cityUnknown).toBe(false);
  });

  it("looks for the city inside a single-line address", () => {
    expect(checkAddress({ raw: "House 5, Street 2, Satellite Town, Rawalpindi", structured: false }).cityMissing).toBe(false);
    expect(checkAddress({ raw: "House 5, Street 2, Rahim Yar Khan", structured: false }).cityMissing).toBe(false);
    expect(checkAddress({ raw: "House 5, Street 2, Satellite Town", structured: false }).cityMissing).toBe(true);
  });
});

describe("scoreSignals", () => {
  it("scores an ordinary order low with no signals", () => {
    const r = scoreSignals(facts());
    expect(r).toMatchObject({ score: 0, level: "low", flagged: false, reason: null, signals: [] });
  });

  it("treats the blocklist as a hard rule — high and flagged whatever the history", () => {
    const r = scoreSignals(facts({ blocklisted: true, store: { cancelled: 0, returned: 0, delivered: 9, total: 9 } }));
    expect(r.score).toBe(100);
    expect(r.level).toBe("high");
    expect(r.flagged).toBe(true);
    expect(r.reason).toContain("blocklist");
    expect(r.reason).not.toContain("delivered"); // a reason is only ever a risk, never the good history
  });

  it("raises risk for a fake phone and a bad address, in plain words", () => {
    const r = scoreSignals(facts({ phone: "03000000000", address: { line1: "ghar", city: "", structured: true } }));
    expect(r.score).toBe(RISK_WEIGHTS.phoneFake + RISK_WEIGHTS.addressShort + RISK_WEIGHTS.cityMissing);
    expect(r.level).toBe("high");
    expect(r.flagged).toBe(true);
    expect(r.signals.map((s) => s.label)).toEqual(["Phone number looks made up (repeated or 1234567 digits)", "Address is very short", "No city given"]);
    expect(r.reason).toBe(r.signals.map((s) => s.label).join(" · "));
  });

  it("an invalid phone alone is not enough to flag", () => {
    const r = scoreSignals(facts({ phone: "12345" }));
    expect(r.score).toBe(RISK_WEIGHTS.phoneInvalid);
    expect(r.level).toBe("low");
    expect(r.flagged).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("skips the Pakistani phone and city checks for a store that isn't in Pakistan", () => {
    const r = scoreSignals(facts({ pakistan: false, phone: "+14155550123", address: { line1: "221B Baker Street", city: "London", structured: true } }));
    expect(r.signals).toEqual([]);
  });

  it("delivered history lowers the risk", () => {
    const risky = facts({ store: { cancelled: 3, returned: 0, delivered: 0, total: 3 } });
    const withGoodHistory = facts({ store: { cancelled: 3, returned: 0, delivered: 3, total: 6 } });
    const a = scoreSignals(risky);
    const b = scoreSignals(withGoodHistory);
    expect(a.score).toBe(45);
    expect(a.level).toBe("medium");
    expect(b.score).toBe(15);
    expect(b.level).toBe("low");
    expect(b.signals.at(-1)).toEqual({ label: "3 past orders from this phone were delivered — lowers the risk", weight: -30 });
  });

  it("caps what history can add or take off, and never leaves 0–100", () => {
    const good = scoreSignals(facts({ store: { cancelled: 0, returned: 0, delivered: 50, total: 50 }, network: { cancelled: 0, returned: 0, delivered: 50, total: 50 } }));
    expect(good.score).toBe(0);
    expect(good.signals.map((s) => s.weight)).toEqual([RISK_WEIGHTS.networkDelivered.cap, RISK_WEIGHTS.storeDelivered.cap]);
    const bad = scoreSignals(
      facts({
        phone: "03000000000",
        store: { cancelled: 9, returned: 9, delivered: 0, total: 18 },
        network: { cancelled: 9, returned: 9, delivered: 0, total: 18 },
        maxLineQty: 40,
        ordersLast24h: 6,
      }),
    );
    expect(bad.score).toBe(100);
    expect(bad.signals.find((s) => s.label.includes("came back undelivered"))?.weight).toBe(RISK_WEIGHTS.storeReturned.cap);
  });

  it("uses courier returns in this store's history", () => {
    const r = scoreSignals(facts({ store: { cancelled: 0, returned: 2, delivered: 0, total: 2 } }));
    expect(r.score).toBe(60);
    expect(r.level).toBe("medium");
    expect(r.signals[0].label).toBe("2 past orders from this phone came back undelivered (courier return)");
  });

  it("uses the Orbit-wide history as counts only", () => {
    const r = scoreSignals(facts({ network: { cancelled: 2, returned: 3, delivered: 1, total: 6 } }));
    expect(r.score).toBe(45 + 12 - 5);
    expect(r.level).toBe("medium");
    expect(r.signals.map((s) => s.label)).toEqual([
      "3 orders from this phone were returned undelivered on other Orbit stores",
      "2 orders from this phone were cancelled on other Orbit stores",
      "1 order from this phone was delivered on other Orbit stores — lowers the risk",
    ]);
  });

  it("flags a large first order, but not for a returning customer or a store with too few orders", () => {
    expect(scoreSignals(facts({ subtotal: 9000, storeAverage: 2000 })).score).toBe(RISK_WEIGHTS.largeFirstOrder);
    expect(scoreSignals(facts({ subtotal: 9000, storeAverage: null })).score).toBe(0);
    expect(scoreSignals(facts({ subtotal: 9000, storeAverage: 2000, store: { cancelled: 0, returned: 0, delivered: 0, total: 1 } })).score).toBe(0);
  });

  it("flags bulk quantity and several orders in 24 hours", () => {
    expect(scoreSignals(facts({ maxLineQty: 10 })).signals).toEqual([{ label: "10 units of a single item", weight: RISK_WEIGHTS.bulkQty }]);
    expect(scoreSignals(facts({ maxLineQty: 9 })).signals).toEqual([]);
    expect(scoreSignals(facts({ ordersLast24h: 1 })).signals).toEqual([]);
    expect(scoreSignals(facts({ ordersLast24h: 3 })).signals).toEqual([{ label: "3 other orders from this phone in the last 24 hours", weight: RISK_WEIGHTS.repeat24h }]);
  });

  it("maps scores to levels at 35 and 65", () => {
    expect([0, 34, 35, 64, 65, 100].map(levelFor)).toEqual(["low", "low", "medium", "medium", "high", "high"]);
  });

  it("flags exactly when the level is high", () => {
    const medium = scoreSignals(facts({ phone: "03000000000", maxLineQty: 1 })); // 45
    expect(medium.level).toBe("medium");
    expect(medium.flagged).toBe(false);
    const high = scoreSignals(facts({ phone: "03000000000", maxLineQty: 12 })); // 65
    expect(high.score).toBe(65);
    expect(high.level).toBe("high");
    expect(high.flagged).toBe(true);
  });
});

describe("history counts", () => {
  it("counts a courier return as returned even after the seller cancelled the order", () => {
    expect(
      tallyHistory([
        { status: "fulfilled", courierStatus: "delivered", _count: { _all: 4 } },
        { status: "fulfilled", courierStatus: null, _count: { _all: 1 } },
        { status: "cancelled", courierStatus: "returned", _count: { _all: 2 } },
        { status: "shipped", courierStatus: "returning", _count: { _all: 1 } },
        { status: "cancelled", courierStatus: null, _count: { _all: 3 } },
        { status: "pending", courierStatus: null, _count: { _all: 1 } },
      ]),
    ).toEqual({ delivered: 5, returned: 3, cancelled: 3, total: 12 });
  });

  it("reads stored signals and ignores anything malformed", () => {
    expect(parseRiskSignals('[{"label":"Address is very short","weight":15},{"label":5}]')).toEqual([{ label: "Address is very short", weight: 15 }]);
    expect(parseRiskSignals("not json")).toEqual([]);
    expect(parseRiskSignals(null)).toEqual([]);
  });
});

describe("with the database", () => {
  beforeEach(() => {
    db.business.findUnique.mockReset().mockResolvedValue({ fraudBlocklist: null, storeCurrency: "pkr" });
    db.order.groupBy.mockReset().mockResolvedValue([]);
    db.order.count.mockReset().mockResolvedValue(0);
    db.order.findMany.mockReset().mockResolvedValue([]);
  });

  it("asks other stores for counts only — never a store, a name or what was bought", async () => {
    db.order.groupBy.mockResolvedValue([{ status: "cancelled", courierStatus: "returned", _count: { _all: 2 } }]);
    const r = await networkPhoneHistory("0321 4567890", "biz1");
    expect(r).toEqual({ cancelled: 0, returned: 2, delivered: 0, total: 2 });
    const arg = db.order.groupBy.mock.calls[0][0];
    expect(arg.by).toEqual(["status", "courierStatus"]);
    expect(arg.where.businessId).toEqual({ not: "biz1" });
    expect(Object.keys(arg).sort()).toEqual(["_count", "by", "where"]);
    expect(Object.keys(r).sort()).toEqual(["cancelled", "delivered", "returned", "total"]);
  });

  it("screens an order end to end and keeps flagged / reason for the checkout", async () => {
    db.business.findUnique.mockResolvedValue({ fraudBlocklist: JSON.stringify(["0321 4567890"]), storeCurrency: "pkr" });
    const r = await screenOrder("biz1", {
      customerPhone: "+923214567890",
      subtotal: 1500,
      items: [{ qty: 1 }],
      address: "House 12, Street 4, Gulberg, Lahore",
      shipping: { line1: "House 12, Street 4", area: "Gulberg", city: "Lahore" },
    });
    expect(r.flagged).toBe(true);
    expect(r.level).toBe("high");
    expect(r.reason).toBe("Phone is on your blocklist");
  });

  it("a clean order from a customer with delivered history is low risk and not flagged", async () => {
    db.order.groupBy.mockImplementation(async (a: { where: { businessId: unknown } }) =>
      a.where.businessId === "biz1" ? [{ status: "fulfilled", courierStatus: "delivered", _count: { _all: 2 } }] : [],
    );
    const r = await screenOrder("biz1", {
      customerPhone: "03214567890",
      subtotal: 1500,
      items: [{ qty: 2 }],
      address: "House 12, Street 4, Gulberg, Lahore",
      shipping: { line1: "House 12, Street 4", area: "Gulberg", city: "Lahore" },
    });
    expect(r).toMatchObject({ flagged: false, reason: null, score: 0, level: "low" });
    expect(r.signals).toEqual([{ label: "2 past orders from this phone were delivered — lowers the risk", weight: -20 }]);
    expect(db.order.findMany).not.toHaveBeenCalled(); // not a first order — no need for the store average
  });

  it("still scores the order when the network look-up fails", async () => {
    db.order.groupBy.mockImplementation(async (a: { where: { businessId: unknown } }) => {
      if (a.where.businessId !== "biz1") throw new Error("db down");
      return [];
    });
    const r = await screenOrder("biz1", { customerPhone: "03214567890", subtotal: 100, items: [{ qty: 10 }], address: "House 1, Street 2, Lahore" });
    expect(r.signals).toEqual([{ label: "10 units of a single item", weight: 20 }]);
  });
});
