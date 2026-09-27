import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/anthropic", () => ({ anthropic: {}, MODEL: "m", MODEL_FAST: "f" }));

const { coerceToolInput } = await import("./orbit-design-generate");

describe("coerceToolInput", () => {
  it("turns a JSON-string field back into an object", () => {
    const out = coerceToolInput({ reply: "hi", rebuild: '{"pages":[{"slug":"home","sections":[]}]}', tokens: '{"accent":"#f97316"}' });
    expect(out.rebuild).toEqual({ pages: [{ slug: "home", sections: [] }] });
    expect(out.tokens).toEqual({ accent: "#f97316" });
    expect(out.reply).toBe("hi");
  });

  it("leaves real objects and non-JSON strings alone", () => {
    const rebuild = { pages: [] };
    const out = coerceToolInput({ rebuild, pages: "not json" });
    expect(out.rebuild).toBe(rebuild);
    expect(out.pages).toBe("not json");
  });
});
