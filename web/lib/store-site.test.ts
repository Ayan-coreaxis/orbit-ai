import { describe, expect, it } from "vitest";
import { buildRunning, composePage, lintSite, manifest, priceLine, siteHeaders, type SiteData, type StoreSite } from "@/lib/store-site";

const sys = (w: string) => page(`<main><div data-orbit-widget="${w}"></div></main>`);
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
    "site.js": 'const a="$& $1";document.title=a;ORBIT.menu;"#account";"#cart"',
    "pages/home.html": page("<h1>Hi</h1>"),
    ...Object.fromEntries(["cart", "checkout", "login", "account", "thanks"].map((w) => [`pages/${w}.html`, sys(w)])),
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
    expect(bad).toMatch(/cart\.html has no/);
  });
  it("always has cart, checkout, login, account and thank-you pages, in the store's own header and footer", () => {
    const old = { files: { "site.css": "", "site.js": "", "pages/home.html": "<html><body><main>hero</main></body></html>", "pages/contact.html": '<!doctype html><html><head><title>C</title></head><body><header>MY HEADER</header><main><form></form></main><footer>MY FOOTER</footer></body></html>' } };
    for (const w of ["cart", "checkout", "login", "account", "thanks"]) {
      const html = composePage(old, { slug: w, data, origin: "https://x.test" })!;
      expect(html).toContain(`data-orbit-widget="${w}"`);
      expect(html).toContain("MY HEADER");
      expect(html).not.toContain("<form></form>");
    }
    // a designed page that lost its working part is not trusted
    expect(composePage({ files: { ...old.files, "pages/cart.html": page("<main>pretty</main>") } }, { slug: "cart", data, origin: "https://x.test" })).toContain("MY HEADER");
    expect(manifest(site()).pages.map((p) => p.slug)).not.toContain("cart");
  });
  it("keeps the seller's click edits apart from the design, and swaps a picture everywhere", () => {
    const s = site({ "site.css": "a{background:url(https://p.test/a.jpg?w=1&q=2)}", "pages/home.html": page('<img src="https://p.test/a.jpg?w=1&amp;q=2">'), "edits.json": JSON.stringify([{ kind: "image", from: "https://p.test/a.jpg?w=1&q=2", to: "/uploads/b/x.webp" }, { kind: "text", page: "*", from: "Hi", to: "Salam </script>" }]) });
    const html = composePage(s, { slug: "home", data, origin: "https://x.test" })!;
    expect(html).not.toContain("p.test/a.jpg");
    expect(html.match(/uploads\/b\/x\.webp/g)!.length).toBe(2);
    expect(html).not.toContain("Salam </script>");
  });
  it("only offers knobs the design declared, and menu links that lead somewhere", () => {
    const m = manifest(site({ "site.json": JSON.stringify({ pages: [], menu: [{ label: "Home", href: "#page:home" }, { label: "Gone", href: "#page:gone" }, { label: "Bad", href: "javascript:alert(1)" }], settings: [{ key: "cols", label: "Columns", type: "number", value: 4 }, { key: "<x>", label: "x", type: "text", value: "" }] }) }));
    expect(m.menu).toEqual([{ label: "Home", href: "#page:home" }]);
    expect(m.settings.map((x) => x.key)).toEqual(["cols"]);
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
