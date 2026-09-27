import { describe, it, expect } from "vitest";
import { marketCurrency, mentionsPakistan } from "./market-country";

describe("market from the seller's words", () => {
  it("spots Pakistani sellers from a city, rupees or PKR", () => {
    expect(mentionsPakistan("Loose chai patti — Lahore se")).toBe(true);
    expect(mentionsPakistan("Chai patti 250g Rs 450")).toBe(true);
    expect(mentionsPakistan("prices in PKR")).toBe(true);
    expect(mentionsPakistan("organic oils from Oregon")).toBe(false);
    expect(mentionsPakistan("hyderabadi biryani masala")).toBe(false); // a word, not the city
  });

  it("only overrides the default USD, never a currency the seller chose", () => {
    expect(marketCurrency("usd", "Lahore se chai")).toBe("pkr");
    expect(marketCurrency("usd", "handmade candles")).toBe("usd");
    expect(marketCurrency("aed", "Lahore se chai")).toBe("aed");
  });
});
