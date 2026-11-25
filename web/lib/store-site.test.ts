import { describe, expect, it } from "vitest";
import { buildRunning, composePage, lintSite, manifest, priceLine, siteHeaders, type SiteData, type StoreSite } from "@/lib/store-site";

const page = (body: string) => `<!doctype html><html><head><title>x</title><link rel="stylesheet" href="site.css"></head><body>${body}<script src="site.js"></script></body></html>`;
const data: SiteData = {
  store: { id: "b", name: "Mehfil </script><b>", currency: "pkr", email: "", phone: "", address: "", socials: {}, announcement: "" },
  products: [
    { id: "p1", name: "Mug", price: 950, image: null, images: [], description: "", category: null, stock: 3, options: [], variants: [] },
    { id: "p2", name: "Tee", price: 1000, image: null, images: [], description: "", category: null, stock: 3, options: [{ name: "Size", values: ["S"] }], variants: [{ id: "v1", label: "S", options: { Size: "S" }, price: 1200, stock: 1, image: null }] },
  ],
};
const site = (extra: Record<string, string> = {}): StoreSite => ({
  files: {
    "site.json": JSON.stringify({ pages: [{ slug: "home", title: "Home" }], theme: { bg: "#fff", accent: "#000" } }),
    "site.css": "body{color:red}",
    "site.js": 'const a="$& $1";document.title=a;',
    "pages/home.html": page("<h1>Hi</h1>"),
    ...extra,
  },
});

describe("store site", () => {
  it("serves one document with the shared files inlined, untouched by $ patterns, and data that can't break out", () => {
    const html = composePage(site(), { slug: "home", data, origin: "https://x.test" })!;
    expect(html).toContain("<style>body{color:red}</style>");
    expect(html).toContain('const a="$& $1"');
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("window.ORBIT=");
    expect(composePage(site(), { slug: "nope", data, origin: "https://x.test" })).toBeNull();
    expect(composePage(site(), { slug: "../site", data, origin: "https://x.test" })).toBeNull();
  });
  it("is sandboxed without same-origin and only runs Orbit's own libraries", () => {
    const csp = siteHeaders("https://x.test")["Content-Security-Policy"];
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: https://x.test/vendor/");
    expect(csp).toContain("form-action 'none'");
  });
  it("lists exactly the pages the seller has — none are forced", () => {
    expect(manifest(site()).pages.map((p) => p.slug)).toEqual(["home"]);
    const m = manifest(site({ "pages/lookbook.html": page(""), "pages/product.html": page("") }));
    expect(m.pages.map((p) => p.slug)).toEqual(["home", "lookbook", "product"]);
    expect(m.pages.find((p) => p.slug === "product")!.nav).toBe(false);
  });
  it("finds dead links, outside scripts, storage use and platform screens", () => {
    expect(lintSite(site(), ["p1"])).toEqual([]);
    const bad = lintSite(site({ "pages/x.html": page(`<a href="#page:gone">a</a><a href="#product:zzz">b</a><script src="https://evil.test/a.js"></script><script>localStorage.x=1</script>`), "pages/cart.html": page("") }), ["p1"]).join("\n");
    expect(bad).toMatch(/#page:gone/);
    expect(bad).toMatch(/zzz/);
    expect(bad).toMatch(/evil\.test/);
    expect(bad).toMatch(/browser storage/);
    expect(bad).toMatch(/cart screen/);
  });
  it("prices a line from our own products only", () => {
    expect(priceLine(data.products, "p1", null)?.price).toBe(950);
    expect(priceLine(data.products, "p2", "v1")?.price).toBe(1200);
    expect(priceLine(data.products, "p2", null)).toBeNull();
    expect(priceLine(data.products, "nope", null)).toBeNull();
  });
  it("treats a build without a heartbeat as interrupted", () => {
    const b = { id: "1", kind: "build" as const, status: "running" as const, log: [], startedAt: "", beatAt: new Date().toISOString(), costUsd: 0 };
    expect(buildRunning(b)).toBe(true);
    expect(buildRunning({ ...b, beatAt: new Date(Date.now() - 3_600_000).toISOString() })).toBe(false);
  });
});
