import { describe, it, expect } from "vitest";
import { replyLanguage } from "@/lib/chatbot";

describe("replyLanguage", () => {
  it("tells English, Roman Urdu and Urdu script apart", () => {
    expect(replyLanguage("Is the vitamin C serum okay for oily skin in this heat?")).toBe("english");
    expect(replyLanguage("bhai ye serum oily skin ke liye theek hai?")).toBe("roman-urdu");
    expect(replyLanguage("کیا یہ سیرم اچھا ہے؟")).toBe("urdu");
    expect(replyLanguage("hi")).toBeNull();
  });
});
