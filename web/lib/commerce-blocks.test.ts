import { describe, expect, it } from "vitest";
import { pickProducts, renderCommerceBlocks, type CommerceCtx, type CommerceProduct } from "./commerce-blocks";

const P = (id: string, over: Partial<CommerceProduct> = {}): CommerceProduct => ({
  id,
  name: `Product ${id}`,
  category: null,
  price: 1000,
  imageUrl: `https://img.test/${id}.jpg`,
  description: null,
  stock: 5,
  ...over,
});

const ctx = (products: CommerceProduct[], preview = false): CommerceCtx => ({
  products,
  sample: [P("s1"), P("s2")],
  preview,
  shopSlug: "shop",
  money: (n) => `Rs ${n.toLocaleString("en-US")}`,
  card: (p) => `<card:${p.id}>`,
  esc: (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  escAttr: (s) => s.replace(/"/g, "&quot;"),
});

describe("commerce blocks", () => {
  it("bestsellers rank by real sales and fall back honestly without sales data", () => {
    const list = [P("a", { sold: 2 }), P("b", { sold: 9 }), P("c", { sold: 0 })];
    expect(pickProducts(list, "bestsellers", 8).map((p) => p.id)).toEqual(["b", "a"]);
    const noSales = [P("a", { stock: 0 }), P("b")];
    expect(pickProducts(noSales, "bestsellers", 8).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("filters by category and price", () => {
    const list = [P("a", { category: "Raw Honey", price: 3200 }), P("b", { category: "Ghee", price: 1800 }), P("c", { price: 900 })];
    expect(pickProducts(list, "category:raw honey", 8).map((p) => p.id)).toEqual(["a"]);
    expect(pickProducts(list, "under:2000", 8).map((p) => p.id)).toEqual(["c", "b"]);
  });

  it("fills a product rail and keeps the designer's container", () => {
    const html = `<section><h2>Bestsellers</h2><div class="x" style="margin-top:20px" data-od-products="new" data-od-limit="2"></div></section>`;
    const out = renderCommerceBlocks(html, ctx([P("a"), P("b"), P("c")]));
    expect(out).toContain(`<div class="x" style="margin-top:20px" data-od-products="new" data-od-limit="2"><div class="od-rail" role="list"><card:a><card:b></div></div>`);
    expect(out).not.toContain("card:c");
    expect(out.startsWith("<section><h2>Bestsellers</h2>")).toBe(true);
  });

  it("removes a block with nothing real to show (live store) but shows samples in the studio", () => {
    const html = `<p>before</p><div data-od-products="category:shoes"></div><p>after</p>`;
    expect(renderCommerceBlocks(html, ctx([P("a")]))).toBe("<p>before</p><p>after</p>");
    expect(renderCommerceBlocks(`<div data-od-products="new"></div>`, ctx([], true))).toContain("card:s1");
    expect(renderCommerceBlocks(`<div data-od-products="new"></div>`, ctx([], false))).toBe("");
  });

  it("collections need two real categories and link to the filtered shop", () => {
    const one = renderCommerceBlocks(`<div data-od-collections></div>`, ctx([P("a", { category: "Honey" })]));
    expect(one).toBe("");
    const two = renderCommerceBlocks(`<div data-od-collections data-od-layout="tiles"></div>`, ctx([P("a", { category: "Raw Honey" }), P("b", { category: "Ghee" }), P("c", { category: "Ghee" })]));
    expect(two).toContain('href="#page:shop?cat=raw-honey"');
    expect(two).toContain("2 items");
    expect(two).toContain("od-colls--tiles");
  });

  it("featured product uses the real bestseller and its real price", () => {
    const out = renderCommerceBlocks(`<div data-od-featured-product="bestseller"></div>`, ctx([P("a", { sold: 1 }), P("b", { sold: 5, name: "Sidr Honey", price: 3200 })]));
    expect(out).toContain("Sidr Honey");
    expect(out).toContain("Rs 3,200");
    expect(out).toContain('data-od-buy="b"');
  });

  it("price bands come from the real price spread", () => {
    const list = [900, 1400, 1900, 3200, 3800, 4500, 5200].map((price, i) => P(`p${i}`, { price }));
    const out = renderCommerceBlocks(`<div data-od-price-bands></div>`, ctx(list));
    expect(out).toContain("Under Rs");
    expect(out).toContain("and above");
    expect(out).toMatch(/href="#page:shop\?pmax=\d+"/);
  });

  it("handles nested markup inside a marker and several markers", () => {
    const html = `<div data-od-products="new"><div><span>old</span></div></div><div data-od-price-bands></div><div>keep</div>`;
    const out = renderCommerceBlocks(html, ctx([P("a")]));
    expect(out).not.toContain("old");
    expect(out).toContain("card:a");
    expect(out.endsWith("<div>keep</div>")).toBe(true);
  });
});
