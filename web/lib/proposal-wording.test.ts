import { describe, expect, it } from "vitest";
import { asProposed } from "./strategy-chat";

describe("asProposed — a change waiting for Apply never reads as done", () => {
  it("rewrites Roman Urdu 'kar diya hai'", () => {
    expect(asProposed("Ashwagandha ka stock 60 units kar diya hai. Neeche Apply dabayein.")).toBe(
      "Ashwagandha ka stock 60 units karne ka proposal tayyar hai. Neeche Apply dabayein.",
    );
    expect(asProposed("Price Rs 900 kar di hai — Apply dabayen")).toBe("Price Rs 900 karne ka proposal tayyar hai — Apply dabayen");
  });
  it("rewrites English 'I've updated'", () => {
    expect(asProposed("I've updated the price.")).toBe("I've proposed updating the price.");
  });
  it("leaves proposal wording alone", () => {
    const s = "Moringa ki price Rs 900 karne ka proposal tayyar hai — neeche Apply dabayein.";
    expect(asProposed(s)).toBe(s);
  });
});
