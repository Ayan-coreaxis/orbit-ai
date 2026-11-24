import { describe, expect, it } from "vitest";
import { ago, demoConversations, demoName, initials, isDemoRef } from "@/lib/inbox";

describe("inbox helpers", () => {
  it("recognises demo refs and names them", () => {
    expect(isDemoRef("demo:ayesha-khan")).toBe(true);
    expect(isDemoRef("whatsapp:+923001234567")).toBe(false);
    expect(demoName("demo:ayesha-khan")).toBe("Ayesha Khan");
    expect(initials("Ayesha Khan")).toBe("AK");
    expect(initials("+92 300")).toBe("?");
  });

  it("builds realistic demo threads from the shop's own products", () => {
    const threads = demoConversations(["Sidr Honey 500g", "Desi Ghee 1kg", "Dry Fruit Box"]);
    expect(threads).toHaveLength(6);
    expect(new Set(threads.map((t) => t.channel))).toEqual(new Set(["whatsapp", "instagram", "messenger", "website"]));
    expect(threads.every((t) => isDemoRef(t.ref))).toBe(true);
    // some wait for the seller, some are answered (by the bot or by the seller)
    const lastRoles = threads.map((t) => t.messages[t.messages.length - 1].role);
    expect(lastRoles).toContain("user");
    expect(lastRoles).toContain("assistant");
    expect(threads.flatMap((t) => t.messages).some((m) => m.sender === "owner")).toBe(true);
    expect(JSON.stringify(threads)).toContain("Desi Ghee 1kg");
    // oldest message first within each thread
    for (const t of threads) expect(t.messages.map((m) => m.ago)).toEqual([...t.messages.map((m) => m.ago)].sort((a, b) => b - a));
  });

  it("falls back to generic product names", () => {
    expect(JSON.stringify(demoConversations([]))).toContain("Raw Honey 500g");
  });

  it("formats time compactly", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(ago("2026-11-24T11:59:40Z", now)).toBe("now");
    expect(ago("2026-11-24T11:46:00Z", now)).toBe("14 m");
    expect(ago("2026-11-24T09:00:00Z", now)).toBe("3 h");
    expect(ago("2026-11-22T12:00:00Z", now)).toBe("2 d");
  });
});
