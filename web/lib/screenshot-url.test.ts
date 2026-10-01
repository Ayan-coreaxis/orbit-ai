import { describe, it, expect } from "vitest";
import { firstSiteUrl, looksLikeImageUrl } from "@/lib/screenshot";

describe("firstSiteUrl", () => {
  it("skips photo links and returns the first real site", () => {
    expect(looksLikeImageUrl("https://images.unsplash.com/photo-1?w=1200")).toBe(true);
    expect(looksLikeImageUrl("https://example.com/a/b.JPG?x=1")).toBe(true);
    expect(firstSiteUrl("hero: https://images.unsplash.com/photo-1 and copy https://glossier.com.")).toBe("https://glossier.com");
    expect(firstSiteUrl("use https://example.com/hero.webp")).toBeNull();
  });
});
