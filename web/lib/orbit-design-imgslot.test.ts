import { describe, it, expect } from "vitest";
import { defaultDoc, renderPageDocument } from "./orbit-design";

describe("image slots", () => {
  it("uses a photo the model put on a slot as a CSS background instead of showing a placeholder", () => {
    const doc = defaultDoc("Noor", "skincare");
    const home = doc.pages.find((p) => p.slug === "home")!;
    home.sections.unshift({
      id: "hero-x", type: "custom", label: "Hero", visible: true,
      html: `<section><div data-img-slot="warm hero" style="position:absolute;inset:0;width:100%;height:100%;background-image:url('https://images.unsplash.com/photo-123?w=2400&q=80');background-size:cover;"></div><h1>Hi</h1></section>`,
    });
    const html = renderPageDocument(doc, { products: [], businessId: "b1" });
    expect(html).toContain(`<img src="https://images.unsplash.com/photo-123?w=2400&amp;q=80"`);
    expect(html).not.toMatch(/data-od-imgslot[^>]*border-radius[^>]*><img src="https:\/\/images\.unsplash\.com\/photo-123/);
  });
});

describe("phone-only styles", () => {
  it("turns data-od-sm into a scoped ≤700px rule and rejects unsafe values", async () => {
    const { phoneStyles } = await import("./orbit-design");
    const out = phoneStyles(`<div data-od-sm="background:rgba(0,0,0,.6);padding:20px">a</div><p data-od-sm="background:url(https://x.y/z)">b</p>`);
    expect(out).toMatch(/^<style>@media \(max-width:700px\)\{\[data-od-sm-id="[a-z0-9]+"\]\{background:rgba\(0,0,0,\.6\) !important;padding:20px !important\}\}<\/style>/);
    expect(out).not.toContain("url(");
    expect(out).toContain("<p>b</p>");
  });
});
