import { describe, it, expect } from "vitest";
import { defaultDoc, renderPageDocument } from "./orbit-design";

describe("storefront header", () => {
  it("keeps a shortened brand wordmark that links home, but drops a duplicate Home link", () => {
    const doc = defaultDoc("Shifa Herbals", "herbal remedies");
    doc.components.header = `<header style="display:flex"><a href="#page:home" style="font-weight:800">Shi<span>fa</span></a><nav><a href="#page:home">Home</a></nav><!--OD_CART--></header>`;
    const html = renderPageDocument(doc, { products: [], businessId: "b1" });
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain("Shi<span>fa</span>");
    expect(header).not.toMatch(/>\s*Home\s*<\/a>/);
  });
});

describe("storefront content tokens", () => {
  it("drops a social link the seller hasn't set, keeps one they have", () => {
    const doc = defaultDoc("Chai Wala Co.", "chai");
    doc.content.socials.facebook = "https://facebook.com/chaiwala";
    doc.components.footer = `<footer><a href="{{social.instagram}}">📷 Insta</a><a href="{{social.facebook}}">📘 FB</a><p>© {{store.year}} {{store.name}}. All rights reserved.</p></footer>`;
    const html = renderPageDocument(doc, { products: [], businessId: "b1" });
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).not.toContain("Insta");
    expect(footer).toContain("https://facebook.com/chaiwala");
    expect(footer).toContain("Chai Wala Co. All rights reserved");
    expect(footer).not.toContain("Co..");
  });

  it("drops a footer column left with only its heading once its social links are gone", () => {
    const doc = defaultDoc("Chai Wala Co.", "chai");
    doc.components.footer = `<footer><div><div>DUKAAN</div><a href="/shop">Shop</a></div><div>
      <div style="font-weight:700">RAABTA</div>
      <div style="display:flex"><a href="{{social.instagram}}">📷 Insta</a></div>
    </div></footer>`;
    const html = renderPageDocument(doc, { products: [], businessId: "b1" });
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).not.toContain("RAABTA");
    expect(footer).toContain("DUKAAN");
  });

  it('says "From" when a product\'s variants cost different amounts', () => {
    const doc = defaultDoc("Chai Wala Co.", "chai");
    const html = renderPageDocument(doc, {
      businessId: "b1",
      currency: "pkr",
      pageSlug: "shop",
      products: [{ id: "p1", name: "Karak Masala", price: 350, imageUrl: null, description: null, stock: 50, hasVariants: true, fromPrice: 350, maxPrice: 750 }],
    });
    expect(html).toMatch(/From\s+Rs\s*350/);
  });
});

describe("core pages", () => {
  it("never renders a hand-written product template with made-up tokens", () => {
    const doc = defaultDoc("Chai Wala Co.", "chai");
    const product = doc.pages.find((p) => p.slug === "product")!;
    product.sections.unshift({ id: "product-main", type: "custom", label: "Fake", visible: true, html: `<section><h1>{{product.name}}</h1><p>Rs {{product.price}}</p><button>Add to cart</button></section>` });
    const html = renderPageDocument(doc, { products: [], businessId: "b1", pageSlug: "product" });
    expect(html).not.toContain("{{product.name}}");
    expect(html).toContain('data-od-widget="product"');
  });

  it("drops a hand-drawn sign-in form that would sit dead above the real one", () => {
    const doc = defaultDoc("Chai Wala Co.", "chai");
    const login = doc.pages.find((p) => p.slug === "login")!;
    login.sections.unshift({ id: "login-main", type: "custom", label: "Sign in", visible: true, html: `<section><h1>Sign in</h1><label>Email</label><input type="email"/><label>Password</label><input type="password"/><button>Sign in</button></section>` });
    const html = renderPageDocument(doc, { products: [], businessId: "b1", pageSlug: "login" });
    expect(html).not.toContain('type="password"');
    expect(html).toContain('data-od-widget="auth"');
  });
});

describe("links", () => {
  it('sends a bare "/" Home link to the store, not the Orbit site', () => {
    const doc = defaultDoc("Chai Wala Co.", "chai");
    doc.components.footer = `<footer><div><p>Chai, straight from Lahore.</p><nav><a href="/">Home</a><a href="/shop">Shop</a></nav></div><p>© {{store.year}} {{store.name}}</p></footer>`;
    const html = renderPageDocument(doc, { products: [], businessId: "b1" });
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).toContain('href="/store/b1">Home');
    expect(footer).not.toContain('href="/"');
  });
});

describe("default footer", () => {
  it("doesn't double the full stop when the store name ends with one", () => {
    const html = renderPageDocument(defaultDoc("Chai Wala Co.", "chai"), { products: [], businessId: "b1" });
    expect(html).toContain("Chai Wala Co. All rights reserved");
    expect(html).not.toContain("Co.. All");
  });
});
