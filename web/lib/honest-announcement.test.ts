import { describe, it, expect } from "vitest";
import { honestAnnouncement } from "@/lib/orbit-design-generate";

describe("honestAnnouncement", () => {
  it("drops an invented free-delivery clause when the store has no free-delivery amount", () => {
    expect(honestAnnouncement("Cash on delivery, all over Pakistan — free delivery over Rs. 3,000", null)).toBe(
      "Cash on delivery, all over Pakistan",
    );
    expect(honestAnnouncement("Free shipping on every order", null)).toBe("");
  });
  it("keeps it when the seller set a free-delivery amount", () => {
    const t = "Cash on delivery — free delivery over Rs. 3,000";
    expect(honestAnnouncement(t, 3000)).toBe(t);
  });
});
