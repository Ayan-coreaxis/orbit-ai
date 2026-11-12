import { describe, expect, it } from "vitest";
import { RATE_LIMIT, decideSend, fillTemplate, matchKeyword, normalizeKeywords, pickRule, templatePlaceholders } from "@/lib/comment-dm-rules";

describe("keyword matching", () => {
  const keywords = ["price", "link", "kitna", "order karna"];

  it("is case-insensitive and ignores punctuation and emoji", () => {
    expect(matchKeyword("PRICE??", keywords)).toBe("price");
    expect(matchKeyword("Price please 😍", keywords)).toBe("price");
    expect(matchKeyword("send LINK!", keywords)).toBe("link");
  });

  it("matches Roman Urdu words and phrases", () => {
    expect(matchKeyword("Yeh kitna ka hai?", keywords)).toBe("kitna");
    expect(matchKeyword("mujhe ORDER   karna hai", keywords)).toBe("order karna");
    expect(matchKeyword("order kaise karun", keywords)).toBeNull();
  });

  it("matches whole words only", () => {
    expect(matchKeyword("priceless piece", keywords)).toBeNull();
    expect(matchKeyword("linked in bio", keywords)).toBeNull();
    expect(matchKeyword("kitnay", keywords)).toBeNull();
    expect(matchKeyword("", keywords)).toBeNull();
    expect(matchKeyword("nice 🔥", [])).toBeNull();
  });

  it("matches other scripts as whole words too", () => {
    expect(matchKeyword("اس کی قیمت کیا ہے؟", ["قیمت"])).toBe("قیمت");
  });

  it("cleans what the seller typed", () => {
    expect(normalizeKeywords("Price, kitna ,  ORDER  karna,price,, !!")).toEqual(["price", "kitna", "order karna"]);
    expect(normalizeKeywords(["Info", 5, null])).toEqual(["info", "5"]);
    expect(normalizeKeywords(undefined)).toEqual([]);
  });
});

describe("pickRule", () => {
  const all = { id: "all", keywords: ["price"], postId: null, active: true };
  const onePost = { id: "post", keywords: ["price"], postId: "111", active: true };
  const off = { id: "off", keywords: ["info"], postId: null, active: false };

  it("prefers the rule for this exact post over an all-posts rule", () => {
    expect(pickRule([all, onePost], "price?", "111")?.rule.id).toBe("post");
    expect(pickRule([all, onePost], "price?", "222")?.rule.id).toBe("all");
    expect(pickRule([onePost], "price?", "222")).toBeNull();
  });

  it("skips rules that are off and comments with no keyword", () => {
    expect(pickRule([off], "info", null)).toBeNull();
    expect(pickRule([all, onePost], "beautiful!", "111")).toBeNull();
  });
});

describe("fillTemplate", () => {
  const values = { product: "Lawn Suit", price: "Rs 2,450", link: "https://noor.pk/product/p1" };

  it("fills the three placeholders, spacing and case tolerant", () => {
    expect(fillTemplate("{{product}} - {{ PRICE }}\nOrder: {{link}}", values)).toBe("Lawn Suit - Rs 2,450\nOrder: https://noor.pk/product/p1");
  });

  it("never invents: lines with nothing real to show are dropped", () => {
    expect(fillTemplate("Thanks!\n{{product}} - {{price}}\nOrder here: {{link}}", { link: "https://noor.pk" })).toBe("Thanks!\nOrder here: https://noor.pk");
    expect(fillTemplate("Price: {{price}}", {})).toBe("");
  });

  it("removes just the empty placeholder when the line still says something real", () => {
    expect(fillTemplate("{{product}} - {{price}}", { product: "Lawn Suit" })).toBe("Lawn Suit");
    expect(fillTemplate("See {{product}} , now {{price}} !", { product: "Kurta" })).toBe("See Kurta, now!");
  });

  it("leaves unknown placeholders and plain text alone, and caps the length", () => {
    expect(fillTemplate("Hi {{name}}", values)).toBe("Hi {{name}}");
    expect(fillTemplate("x".repeat(2000), values)).toHaveLength(900);
    expect(templatePlaceholders("{{link}} {{Link}} {{price}} {{name}}")).toEqual(["link", "price"]);
  });
});

describe("decideSend", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const base = { commenterId: "u1", ownIds: ["ig-own", "page-own", null], alreadyHandled: false, priorSentAt: [] as Date[], now };

  it("sends to a new commenter", () => {
    expect(decideSend(base)).toEqual({ send: true });
  });

  it("ignores the seller's own comments", () => {
    expect(decideSend({ ...base, commenterId: "ig-own" })).toEqual({ send: false, reason: "own_comment" });
  });

  it("ignores a comment already handled", () => {
    expect(decideSend({ ...base, alreadyHandled: true })).toEqual({ send: false, reason: "duplicate" });
  });

  it("rate-limits per commenter: a cooldown and a daily cap", () => {
    expect(decideSend({ ...base, priorSentAt: [ago(30_000)] })).toEqual({ send: false, reason: "rate_limited" });
    expect(decideSend({ ...base, priorSentAt: [ago(RATE_LIMIT.cooldownMs + 1000)] })).toEqual({ send: true });
    const three = [ago(3600_000), ago(2 * 3600_000), ago(3 * 3600_000)];
    expect(decideSend({ ...base, priorSentAt: three })).toEqual({ send: false, reason: "rate_limited" });
    // Yesterday's DMs no longer count.
    expect(decideSend({ ...base, priorSentAt: [ago(25 * 3600_000), ago(26 * 3600_000), ago(27 * 3600_000)] })).toEqual({ send: true });
  });
});
