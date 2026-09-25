import { describe, it, expect } from "vitest";
import { computeTotals } from "./checkout";

const base = {
  subtotal: 1000,
  discount: 0,
  shippingFee: 200,
  freeShippingOver: null as number | null,
  couponFreeShipping: false,
  taxRatePercent: 0,
};

describe("computeTotals", () => {
  it("plain: subtotal + shipping", () => {
    expect(computeTotals(base)).toMatchObject({ shipping: 200, tax: 0, total: 1200 });
  });

  it("percent discount applies before tax and shipping", () => {
    const r = computeTotals({ ...base, discount: 100, taxRatePercent: 5 });
    // afterDiscount 900, tax 45, shipping 200
    expect(r).toMatchObject({ discount: 100, tax: 45, shipping: 200, total: 1145 });
  });

  it("discount is capped at subtotal", () => {
    expect(computeTotals({ ...base, discount: 5000 }).discount).toBe(1000);
    expect(computeTotals({ ...base, discount: 5000 }).total).toBe(200); // just shipping
  });

  it("free-shipping threshold waives delivery on the discounted subtotal", () => {
    expect(computeTotals({ ...base, freeShippingOver: 900, discount: 0 })).toMatchObject({ freeShipping: true, shipping: 0, total: 1000 });
    // discount drops it below the threshold → shipping charged
    expect(computeTotals({ ...base, freeShippingOver: 900, discount: 200 })).toMatchObject({ freeShipping: false, shipping: 200 });
  });

  it("a free-shipping coupon always waives delivery", () => {
    expect(computeTotals({ ...base, couponFreeShipping: true }).shipping).toBe(0);
  });

  it("rounds to 2 dp", () => {
    const r = computeTotals({ ...base, subtotal: 333.33, discount: 33.33, taxRatePercent: 7.5, shippingFee: 0 });
    expect(r.tax).toBe(22.5);
    expect(r.total).toBe(322.5);
  });

  it("never goes negative", () => {
    expect(computeTotals({ ...base, subtotal: 10, discount: 10, shippingFee: 0 }).total).toBe(0);
  });
});
