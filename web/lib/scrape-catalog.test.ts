import { describe, expect, it, vi } from "vitest";

const routes: Record<string, unknown> = {};
vi.mock("@/lib/safe-fetch", () => ({
  safeFetch: async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
    return hit
      ? new Response(JSON.stringify(hit[1]), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
  },
  assertPublicUrl: async () => {},
  guardBrowserPage: async () => {},
}));

const { readCatalogApi, formatCatalog } = await import("./scrape");

describe("competitor catalog feeds", () => {
  it("reads a Shopify /products.json with sale and sold-out signals", async () => {
    routes["https://shop.test/products.json"] = {
      products: [
        { title: "Eid Lawn 3pc", published_at: "2026-09-20T10:00:00Z", variants: [{ price: "4990.00", compare_at_price: "6990.00", available: true }] },
        { title: "Kurta Basic", published_at: "2026-08-01T10:00:00Z", variants: [{ price: "2490.00", compare_at_price: null, available: false }] },
      ],
    };
    const c = await readCatalogApi("https://shop.test");
    expect(c?.platform).toBe("Shopify");
    expect(c?.items[0]).toMatchObject({ name: "Eid Lawn 3pc", price: 4990, compareAt: 6990, available: true, added: "2026-09-20" });
    const text = formatCatalog(c!);
    expect(text).toContain("2 products seen");
    expect(text).toContain("was 6,990, −29%");
    expect(text).toContain("Kurta Basic: 2,490 · SOLD OUT");
  });

  it("falls back to the WooCommerce Store API", async () => {
    routes["https://woo.test/wp-json/wc/store/v1/products"] = [
      { name: "Chiffon Suit", is_in_stock: true, prices: { price: "550000", regular_price: "650000", currency_code: "PKR", currency_minor_unit: 2 } },
    ];
    const c = await readCatalogApi("https://woo.test");
    expect(c?.platform).toBe("WooCommerce");
    expect(c?.items[0]).toMatchObject({ price: 5500, compareAt: 6500, currency: "PKR" });
  });

  it("returns null when neither feed exists", async () => {
    expect(await readCatalogApi("https://plain.test")).toBeNull();
  });
});
