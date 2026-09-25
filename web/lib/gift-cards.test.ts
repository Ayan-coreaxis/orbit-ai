import { describe, it, expect } from "vitest";
import { giftCardRedeemAmount } from "./gift-cards";

describe("giftCardRedeemAmount", () => {
  it("caps at the order total when balance is larger", () => {
    expect(giftCardRedeemAmount(500, 300)).toBe(300);
  });

  it("caps at the balance when the order total is larger", () => {
    expect(giftCardRedeemAmount(120, 300)).toBe(120);
  });

  it("never goes negative", () => {
    expect(giftCardRedeemAmount(-50, 300)).toBe(0);
    expect(giftCardRedeemAmount(100, -50)).toBe(0);
  });

  it("rounds to 2dp", () => {
    expect(giftCardRedeemAmount(33.336, 100)).toBe(33.34);
  });
});
