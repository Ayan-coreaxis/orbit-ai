import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { periodRanges, costKeyOf, estimatedStripeFee } = await import("./admin-finance");

describe("periodRanges", () => {
  it("compares this month so far with the same days of last month", () => {
    const now = new Date(2026, 8, 27, 15, 0); // 27 Sep, 15:00
    const r = periodRanges("mtd", now);
    expect(r.current.from).toEqual(new Date(2026, 8, 1));
    expect(r.previous!.from).toEqual(new Date(2026, 7, 1));
    expect(r.previous!.to).toEqual(new Date(2026, 7, 27, 15, 0));
  });

  it("never lets 'same days last month' run past last month's end", () => {
    const r = periodRanges("mtd", new Date(2026, 2, 31, 12, 0)); // 31 Mar
    expect(r.previous!.from).toEqual(new Date(2026, 1, 1));
    expect(r.previous!.to).toEqual(new Date(2026, 2, 1)); // capped at 1 Mar, not 3 Mar
  });

  it("last month is the whole calendar month, compared with the month before", () => {
    const r = periodRanges("last_month", new Date(2026, 0, 10)); // January → December and November
    expect(r.current).toEqual({ from: new Date(2025, 11, 1), to: new Date(2026, 0, 1) });
    expect(r.previous).toEqual({ from: new Date(2025, 10, 1), to: new Date(2025, 11, 1) });
  });

  it("all time has nothing to compare with", () => {
    expect(periodRanges("all").previous).toBeNull();
  });
});

describe("cost buckets", () => {
  it("splits usage rows into Claude, search and Studio media", () => {
    expect(costKeyOf("orchestrator-chat")).toBe("claude");
    expect(costKeyOf("studio-director")).toBe("claude"); // the director is a Claude call
    expect(costKeyOf("web-search")).toBe("search");
    expect(costKeyOf("studio-image")).toBe("images");
    expect(costKeyOf("studio-video")).toBe("video");
  });

  it("estimates Stripe's fee only for real charges", () => {
    expect(estimatedStripeFee(75)).toBe(2.48);
    expect(estimatedStripeFee(-75)).toBe(0);
  });
});
