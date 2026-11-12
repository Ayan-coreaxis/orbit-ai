import { describe, expect, it } from "vitest";
import { deflateRawSync } from "zlib";
import {
  cleanHtmlForModel,
  extractJsonLdProducts,
  extractOpenGraphProduct,
  extractProductLinks,
  extractProductsFromPage,
  mapColumns,
  mappingFromModel,
  mappingIsClear,
  parseCsv,
  parsePrice,
  parseShopifyProducts,
  parseStock,
  parseWooProducts,
  parseXlsx,
  rowsToProducts,
  sanitizeImportedProducts,
  sanitizeModelProducts,
  sheetToProducts,
  toProductCreate,
} from "@/lib/product-import";

describe("parsePrice", () => {
  it("reads Pakistani price formats as numbers", () => {
    expect(parsePrice("Rs. 2,450")).toBe(2450);
    expect(parsePrice("PKR 2450.00")).toBe(2450);
    expect(parsePrice("Rs.2450/-")).toBe(2450);
    expect(parsePrice("₨ 1,25,000")).toBe(125000);
    expect(parsePrice("1,234,567.50")).toBe(1234567.5);
    expect(parsePrice("1.234,50")).toBe(1234.5);
    expect(parsePrice("12,5")).toBe(12.5);
    expect(parsePrice("Rs. 1,200 – Rs. 1,500")).toBe(1200);
    expect(parsePrice(999)).toBe(999);
  });
  it("gives null when there is no real price", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("Call for price")).toBeNull();
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
});

describe("parseStock", () => {
  it("only accepts numbers", () => {
    expect(parseStock("12")).toBe(12);
    expect(parseStock("12.0")).toBe(12);
    expect(parseStock("-3")).toBe(0);
    expect(parseStock("in stock")).toBeNull();
    expect(parseStock("")).toBeNull();
  });
});

const SHOPIFY = {
  products: [
    {
      id: 1,
      title: "Lawn Kurta",
      handle: "lawn-kurta",
      body_html: "<p>Soft <strong>lawn</strong> fabric.</p><script>alert(1)</script>",
      product_type: "Kurtas",
      options: [
        { name: "Size", position: 1, values: ["S", "M"] },
        { name: "Color", position: 2, values: ["Blue", "Red"] },
      ],
      variants: [
        { id: 11, title: "S / Blue", option1: "S", option2: "Blue", option3: null, price: "2450.00", sku: "LK-S-B", available: true, featured_image: { src: "https://cdn.shopify.com/kurta-blue.jpg" } },
        { id: 12, title: "M / Blue", option1: "M", option2: "Blue", option3: null, price: "2450.00", sku: "LK-M-B", available: false },
        { id: 13, title: "M / Red", option1: "M", option2: "Red", option3: null, price: "2650.00", sku: "LK-M-R", available: true, inventory_quantity: 7, inventory_management: "shopify" },
      ],
      images: [{ src: "https://cdn.shopify.com/kurta-1.jpg" }, { src: "//cdn.shopify.com/kurta-2.jpg" }],
    },
    {
      id: 2,
      title: "Plain Dupatta",
      handle: "plain-dupatta",
      body_html: "",
      options: [{ name: "Title", position: 1, values: ["Default Title"] }],
      variants: [{ id: 21, title: "Default Title", option1: "Default Title", price: "900.00", available: true }],
      images: [],
    },
    { id: 3, title: "No price item", options: [], variants: [{ id: 31, price: "0.00" }], images: [] },
    {
      id: 4,
      title: "Three Option Shirt",
      handle: "three",
      options: [
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Black"] },
        { name: "Fit", values: ["Slim", "Regular"] },
      ],
      variants: [
        { option1: "S", option2: "Black", option3: "Slim", price: "1500" },
        { option1: "M", option2: "Black", option3: "Regular", price: "1700" },
      ],
      images: [],
    },
  ],
};

describe("parseShopifyProducts", () => {
  const products = parseShopifyProducts(SHOPIFY, "https://shop.example");
  it("turns products.json into products with variants", () => {
    expect(products.map((p) => p.name)).toEqual(["Lawn Kurta", "Plain Dupatta", "Three Option Shirt"]);
    const kurta = products[0];
    expect(kurta.price).toBe(2450);
    expect(kurta.optionTypes).toEqual([
      { name: "Size", values: ["S", "M"] },
      { name: "Color", values: ["Blue", "Red"] },
    ]);
    expect(kurta.variants).toHaveLength(3);
    expect(kurta.variants[0]).toMatchObject({ options: { Size: "S", Color: "Blue" }, price: null, stock: null, sku: "LK-S-B", imageUrl: "https://cdn.shopify.com/kurta-blue.jpg" });
    expect(kurta.variants[1].stock).toBe(0); // available: false
    expect(kurta.variants[2]).toMatchObject({ price: 2650, stock: 7 });
    expect(kurta.imageUrl).toBe("https://cdn.shopify.com/kurta-1.jpg");
    expect(kurta.galleryUrls).toEqual(["https://cdn.shopify.com/kurta-2.jpg"]);
    expect(kurta.category).toBe("Kurtas");
    expect(kurta.sourceUrl).toBe("https://shop.example/products/lawn-kurta");
    expect(kurta.description).toContain("<strong>lawn</strong>");
    expect(kurta.description).not.toContain("script");
    expect(kurta.warnings).toContain("No stock number in the source");
  });
  it("treats Shopify's Default Title as a product without variants and never invents stock", () => {
    const dupatta = products[1];
    expect(dupatta.optionTypes).toEqual([]);
    expect(dupatta.variants).toEqual([]);
    expect(dupatta.price).toBe(900);
    expect(dupatta.stock).toBeNull();
    expect(dupatta.description).toBeNull();
    expect(dupatta.warnings).toEqual(["No stock number in the source", "No photo"]);
  });
  it("drops items without a price and folds a third option into the second", () => {
    expect(products.find((p) => p.name === "No price item")).toBeUndefined();
    const shirt = products[2];
    expect(shirt.optionTypes).toEqual([
      { name: "Size", values: ["S", "M"] },
      { name: "Color / Fit", values: ["Black / Slim", "Black / Regular"] },
    ]);
    expect(shirt.variants.map((v) => v.options)).toEqual([
      { Size: "S", "Color / Fit": "Black / Slim" },
      { Size: "M", "Color / Fit": "Black / Regular" },
    ]);
    expect(shirt.price).toBe(1500);
    expect(shirt.variants[1].price).toBe(1700);
  });
  it("becomes an Apply-gated product_create proposal unchanged", () => {
    const c = toProductCreate(products[0]);
    expect(c).toMatchObject({ op: "product_create", name: "Lawn Kurta", price: 2450, stock: 0, imageUrl: "https://cdn.shopify.com/kurta-1.jpg" });
    expect(c.variants[2]).toEqual({ options: { Size: "M", Color: "Red" }, price: 2650, stock: 7 });
  });
});

const WOO = [
  {
    id: 50,
    name: "Honey &amp; Almond Jar",
    permalink: "https://woo.example/product/honey/",
    type: "simple",
    description: "<p>Raw honey.</p>",
    short_description: "",
    prices: { price: "185000", regular_price: "200000", sale_price: "185000", currency_code: "PKR", currency_minor_unit: 2, price_range: null },
    images: [{ src: "https://woo.example/honey.jpg" }, { src: "https://woo.example/honey-2.jpg" }],
    categories: [{ id: 1, name: "Food" }],
    is_in_stock: true,
    attributes: [],
    variations: [],
  },
  {
    id: 60,
    name: "Cotton Tee",
    type: "variable",
    description: "",
    short_description: "<p>Everyday tee</p>",
    prices: { price: "1200", currency_code: "PKR", currency_minor_unit: 0, price_range: { min_amount: "1200", max_amount: "1500" } },
    images: [{ src: "https://woo.example/tee.jpg" }],
    is_in_stock: true,
    attributes: [
      { id: 1, name: "Size", taxonomy: "pa_size", has_variations: true, terms: [{ id: 1, name: "Small", slug: "small" }, { id: 2, name: "Large", slug: "large" }] },
      { id: 2, name: "Brand", has_variations: false, terms: [{ id: 9, name: "Acme", slug: "acme" }] },
    ],
    variations: [
      { id: 61, attributes: [{ name: "Size", value: "small" }] },
      { id: 62, attributes: [{ name: "Size", value: "large" }] },
    ],
  },
  { id: 70, name: "Sold out thing", prices: { price: "500", currency_minor_unit: 0 }, is_in_stock: false, images: [], attributes: [], variations: [] },
  { id: 80, name: "Priceless", prices: { price: "", currency_minor_unit: 0 }, images: [] },
];

describe("parseWooProducts", () => {
  const products = parseWooProducts(WOO);
  it("reads the Store API reply, converting minor units", () => {
    expect(products.map((p) => p.name)).toEqual(["Honey & Almond Jar", "Cotton Tee", "Sold out thing"]);
    expect(products[0]).toMatchObject({ price: 1850, stock: null, category: "Food", imageUrl: "https://woo.example/honey.jpg", galleryUrls: ["https://woo.example/honey-2.jpg"], sourceUrl: "https://woo.example/product/honey/" });
    expect(products[2]).toMatchObject({ price: 500, stock: 0 });
  });
  it("maps variation slugs to option names and flags differing option prices", () => {
    const tee = products[1];
    expect(tee.optionTypes).toEqual([{ name: "Size", values: ["Small", "Large"] }]);
    expect(tee.variants.map((v) => [v.options, v.sourceId, v.price])).toEqual([
      [{ Size: "Small" }, "61", null],
      [{ Size: "Large" }, "62", null],
    ]);
    expect(tee.price).toBe(1200);
    expect(tee.description).toBe("<p>Everyday tee</p>");
    expect(tee.warnings.some((w) => w.startsWith("Options have different prices"))).toBe(true);
  });
});

describe("page structured data", () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"WebSite","name":"Shop"},
      {"@type":"Product","name":"Leather Wallet","description":"Hand stitched.","image":["/img/wallet.jpg","https://cdn.x.com/wallet-2.jpg"],
       "offers":{"@type":"Offer","price":"3,200","priceCurrency":"PKR","availability":"https://schema.org/InStock"}},
      {"@type":"Product","name":"Belt","image":{"@type":"ImageObject","url":"https://cdn.x.com/belt.jpg"},
       "offers":[{"@type":"Offer","price":1800,"availability":"https://schema.org/OutOfStock"}]},
      {"@type":"Product","name":"No offer product"}
    ]}</script>
    <script type="application/ld+json">{ this is broken json </script>
    <script type="application/ld+json">{"@type":"ItemList","itemListElement":[
      {"@type":"ListItem","position":1,"url":"https://shop.example/products/cap"},
      {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Scarf","offers":{"@type":"AggregateOffer","lowPrice":"950","highPrice":"1200"}}}
    ]}</script></head><body></body></html>`;

  it("extracts JSON-LD Product and ItemList entries with real prices only", () => {
    const { products, links } = extractJsonLdProducts(html, "https://shop.example/collections/all");
    expect(products.map((p) => [p.name, p.price, p.stock])).toEqual([
      ["Leather Wallet", 3200, null],
      ["Belt", 1800, 0],
      ["Scarf", 950, null],
    ]);
    expect(products[0].imageUrl).toBe("https://shop.example/img/wallet.jpg");
    expect(products[0].galleryUrls).toEqual(["https://cdn.x.com/wallet-2.jpg"]);
    expect(products[0].description).toBe("Hand stitched.");
    expect(products[1].imageUrl).toBe("https://cdn.x.com/belt.jpg");
    expect(links).toEqual(["https://shop.example/products/cap"]);
  });

  it("reads a ProductGroup's variants", () => {
    const group = `<script type="application/ld+json">{"@type":"ProductGroup","name":"Runner Shoe","variesBy":["https://schema.org/size"],
      "hasVariant":[
        {"@type":"Product","name":"Runner 41","size":"41","sku":"R41","offers":{"price":"8500","availability":"https://schema.org/InStock"}},
        {"@type":"Product","name":"Runner 42","size":"42","sku":"R42","offers":{"price":"8900","availability":"https://schema.org/OutOfStock"}}
      ]}</script>`;
    const [shoe] = extractJsonLdProducts(group, "https://shop.example/p/runner").products;
    expect(shoe.optionTypes).toEqual([{ name: "Size", values: ["41", "42"] }]);
    expect(shoe.price).toBe(8500);
    expect(shoe.variants).toMatchObject([
      { options: { Size: "41" }, price: null, stock: null, sku: "R41" },
      { options: { Size: "42" }, price: 8900, stock: 0, sku: "R42" },
    ]);
  });

  it("falls back to OpenGraph product tags", () => {
    const og = `<head><meta property="og:type" content="product"><meta content="Clay Mug &amp; Saucer" property="og:title">
      <meta property="og:image" content="https://cdn.x.com/mug.jpg"><meta property="product:price:amount" content="1,150.00">
      <meta property="og:description" content="Hand thrown."></head>`;
    const p = extractOpenGraphProduct(og, "https://shop.example/mug");
    expect(p).toMatchObject({ name: "Clay Mug & Saucer", price: 1150, imageUrl: "https://cdn.x.com/mug.jpg", description: "Hand thrown.", sourceUrl: "https://shop.example/mug" });
    expect(extractProductsFromPage(og, "https://shop.example/mug").products).toHaveLength(1);
    expect(extractOpenGraphProduct(`<meta property="og:title" content="About us">`, "https://shop.example/about")).toBeNull();
  });

  it("finds same-site product links on a listing page", () => {
    const listing = `<a href="/products/cap?variant=1">Cap</a><a href="https://shop.example/product/bag/">Bag</a><a href="https://other.example/products/x">X</a><a href="/products/cap">again</a>`;
    expect(extractProductLinks(listing, "https://shop.example/shop")).toEqual(["https://shop.example/products/cap", "https://shop.example/product/bag/"]);
  });
});

describe("model extraction guard", () => {
  const html = `<html><head><title>x</title></head><body><nav>Home</nav>
    <div class="card"><img src="/i/shawl.jpg" alt="Shawl"><h3>Pashmina Shawl</h3><span>Rs. 4,500</span><p>Sizes: Small, Large</p></div>
    <div class="card"><img data-src="https://cdn.x.com/cap.jpg" src="data:image/gif;base64,AAA"><h3>Wool Cap</h3><span>PKR 950</span></div>
    <script>var price = 99999;</script></body></html>`;
  const cleaned = cleanHtmlForModel(html, "https://shop.example/all");

  it("keeps image links and drops scripts in the text the model sees", () => {
    expect(cleaned).toContain("[img https://shop.example/i/shawl.jpg]");
    expect(cleaned).toContain("[img https://cdn.x.com/cap.jpg]");
    expect(cleaned).toContain("Rs. 4,500");
    expect(cleaned).not.toContain("99999");
  });

  it("keeps only products whose price and photos are really on the page", () => {
    const out = sanitizeModelProducts(
      [
        { name: "Pashmina Shawl", price_text: "Rs. 4,500", image_urls: ["https://shop.example/i/shawl.jpg", "https://evil.example/x.jpg"], options: [{ name: "Size", values: ["Small", "Large", "XXL"] }] },
        { name: "Wool Cap", price_text: "PKR 950", image_urls: ["https://cdn.x.com/cap.jpg"] },
        { name: "Invented Jacket", price_text: "Rs. 7,999" },
        { name: "No price", price_text: "" },
      ],
      cleaned,
      "https://shop.example/all",
    );
    expect(out.map((p) => p.name)).toEqual(["Pashmina Shawl", "Wool Cap"]);
    expect(out[0]).toMatchObject({ price: 4500, imageUrl: "https://shop.example/i/shawl.jpg", galleryUrls: [], optionTypes: [{ name: "Size", values: ["Small", "Large"] }] });
    expect(out[0].variants).toHaveLength(2);
    expect(out[0].variants.every((v) => v.price === null && v.stock === null)).toBe(true);
  });
});

describe("parseCsv", () => {
  it("handles quotes, embedded newlines, BOM and CRLF", () => {
    expect(parseCsv('﻿Name,Price,Notes\r\n"Mug, large","1,200","says ""hi""\nline two"\r\n\r\nCap,950,\r\n')).toEqual([
      ["Name", "Price", "Notes"],
      ["Mug, large", "1,200", 'says "hi"\nline two'],
      ["Cap", "950", ""],
    ]);
  });
  it("sniffs semicolon and tab delimiters", () => {
    expect(parseCsv("Name;Price\nCap;950")).toEqual([["Name", "Price"], ["Cap", "950"]]);
    expect(parseCsv("Name\tPrice\nCap\t950")).toEqual([["Name", "Price"], ["Cap", "950"]]);
  });
});

const SHOPIFY_CSV = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Price,Variant Compare At Price,Image Src,Image Position,Image Alt Text,Variant Image,Cost per item
lawn-kurta,Lawn Kurta,<p>Soft lawn.</p>,Acme,Kurtas,"summer, lawn",TRUE,Size,S,Color,Blue,LK-S-B,shopify,5,deny,2450.00,2900.00,https://cdn.shopify.com/k1.jpg,1,,https://cdn.shopify.com/k-blue.jpg,1400
lawn-kurta,,,,,,,,M,,Blue,LK-M-B,shopify,0,deny,2450.00,2900.00,https://cdn.shopify.com/k2.jpg,2,,,
lawn-kurta,,,,,,,,M,,Red,LK-M-R,shopify,3,deny,2650.00,,,,,,
lawn-kurta,,,,,,,,,,,,,,,,,https://cdn.shopify.com/k3.jpg,3,,,
plain-dupatta,Plain Dupatta,,Acme,Dupattas,,TRUE,Title,Default Title,,,PD-1,shopify,12,deny,900.00,,https://cdn.shopify.com/d1.jpg,1,,,
gift-card,Gift Card,,Acme,,,TRUE,Title,Default Title,,,,,,,,,,,,,
`;

describe("sheet column mapping", () => {
  it("maps a Shopify export and groups rows sharing a handle into one product with variants", () => {
    const sheet = parseCsv(SHOPIFY_CSV);
    const m = mapColumns(sheet[0]);
    expect(m).toMatchObject({ handle: 0, name: 1, description: 2, category: 4, sku: 11, stock: 13, price: 15, compareAt: 16, image: 17, variantImage: 20, costPrice: 21 });
    expect(m.options).toEqual([{ name: 7, value: 8 }, { name: 9, value: 10 }]);
    expect(mappingIsClear(m)).toBe(true);

    const { products, dropped } = rowsToProducts(sheet.slice(1), m);
    expect(products.map((p) => p.name)).toEqual(["Lawn Kurta", "Plain Dupatta"]);
    expect(dropped).toBe(1); // the gift card has no price
    const kurta = products[0];
    expect(kurta.optionTypes).toEqual([{ name: "Size", values: ["S", "M"] }, { name: "Color", values: ["Blue", "Red"] }]);
    expect(kurta.variants).toMatchObject([
      { options: { Size: "S", Color: "Blue" }, price: null, stock: 5, sku: "LK-S-B", imageUrl: "https://cdn.shopify.com/k-blue.jpg" },
      { options: { Size: "M", Color: "Blue" }, price: null, stock: 0, sku: "LK-M-B" },
      { options: { Size: "M", Color: "Red" }, price: 2650, stock: 3, sku: "LK-M-R" },
    ]);
    expect(kurta).toMatchObject({ price: 2450, costPrice: 1400, category: "Kurtas", imageUrl: "https://cdn.shopify.com/k1.jpg", description: "<p>Soft lawn.</p>" });
    expect(kurta.galleryUrls).toEqual(["https://cdn.shopify.com/k2.jpg", "https://cdn.shopify.com/k3.jpg"]);
    expect(kurta.warnings).toEqual([]);
    expect(products[1]).toMatchObject({ price: 900, stock: 12, optionTypes: [], variants: [] });
  });

  it("reads a WooCommerce export with variable products and variations", () => {
    const csv = `ID,Type,SKU,Name,Published,Short description,Description,In stock?,Stock,Sale price,Regular price,Categories,Images,Parent,Attribute 1 name,Attribute 1 value(s),Attribute 1 visible,Attribute 1 global
10,simple,HON-1,Honey Jar,1,Raw honey,,1,25,1850,2000,"Food > Honey, Sale","https://woo.example/h1.jpg, https://woo.example/h2.jpg",,Weight,500g,1,1
20,variable,TEE,Cotton Tee,1,,Everyday tee,1,,,,Clothing,https://woo.example/tee.jpg,,Size,"Small, Large",1,1
21,variation,TEE-S,Cotton Tee - Small,1,,,1,4,,1200,,,id:20,Size,Small,,1
22,variation,TEE-L,Cotton Tee - Large,1,,,1,,,1500,,,id:20,Size,Large,,1
`;
    const sheet = parseCsv(csv);
    const m = mapColumns(sheet[0]);
    expect(m).toMatchObject({ wooId: 0, wooType: 1, sku: 2, name: 3, stock: 8, salePrice: 9, price: 10, category: 11, image: 12, wooParent: 13 });
    expect(m.options).toEqual([{ name: 14, value: 15 }]);
    const { products } = rowsToProducts(sheet.slice(1), m);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ name: "Honey Jar", price: 1850, stock: 25, category: "Honey", imageUrl: "https://woo.example/h1.jpg", galleryUrls: ["https://woo.example/h2.jpg"], optionTypes: [] });
    expect(products[1]).toMatchObject({ name: "Cotton Tee", price: 1200, category: "Clothing", description: "Everyday tee", optionTypes: [{ name: "Size", values: ["Small", "Large"] }] });
    expect(products[1].variants).toMatchObject([
      { options: { Size: "Small" }, price: null, stock: 4, sku: "TEE-S" },
      { options: { Size: "Large" }, price: 1500, stock: null, sku: "TEE-L" },
    ]);
  });

  it("reads a hand-made sheet with local price formats and a size column", () => {
    const { products, dropped, mapping } = sheetToProducts([
      ["Product Name", "Rate (PKR)", "Qty", "Photo Link", "Size", "Details"],
      ["Chicken Tikka Masala", "Rs. 2,450", "10", "https://img.example/a.jpg", "", "Spice mix"],
      ["Shalwar Kameez", "PKR 3500.00", "", "", "S, M, L", ""],
      ["Shawl", "1,200/-", "3", "", "Free", ""],
      ["Shawl", "1,400/-", "2", "", "Large", ""],
      ["Coming soon item", "", "", "", "", ""],
    ]);
    expect(mapping).toMatchObject({ name: 0, price: 1, stock: 2, image: 3, description: 5 });
    expect(mapping.options).toEqual([{ value: 4, label: "Size" }]);
    expect(dropped).toBe(1);
    expect(products.map((p) => [p.name, p.price, p.stock])).toEqual([
      ["Chicken Tikka Masala", 2450, 10],
      ["Shalwar Kameez", 3500, null],
      ["Shawl", 1200, null],
    ]);
    expect(products[1].optionTypes).toEqual([{ name: "Size", values: ["S", "M", "L"] }]);
    expect(products[1].variants.every((v) => v.price === null && v.stock === null)).toBe(true);
    expect(products[2].variants).toMatchObject([
      { options: { Size: "Free" }, price: null, stock: 3 },
      { options: { Size: "Large" }, price: 1400, stock: 2 },
    ]);
  });

  it("says when headers are unclear, and accepts a validated mapping from the model", () => {
    const headers = ["Cheez", "Qeemat", "Tadaad"];
    expect(mappingIsClear(mapColumns(headers))).toBe(false);
    const m = mappingFromModel({ name: 0, price: 1, stock: 2, image: 9, options: [{ value: 7 }] }, headers.length);
    expect(m).toEqual({ name: 0, price: 1, stock: 2, options: [] });
    expect(rowsToProducts([["Achar", "Rs 450", "8"]], m).products).toMatchObject([{ name: "Achar", price: 450, stock: 8 }]);
  });

  it("does not mistake compare-at, cost or tax columns for the price", () => {
    const m = mapColumns(["Item", "Compare At Price", "Cost Price", "Tax Rate", "Sale Price", "Stock Status", "Inventory"]);
    expect(m).toMatchObject({ name: 0, compareAt: 1, costPrice: 2, price: 4, stock: 6 });
  });
});

// A minimal .xlsx (zip) built by hand so the reader is tested without a spreadsheet library.
function zip(files: Record<string, string>, compress: boolean): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = compress ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(compress ? 8 : 0, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(n.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    central.push(cd, n);
    offset += 30 + n.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

describe("parseXlsx", () => {
  const files = {
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<workbook xmlns:r="x"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId2" Type="styles" Target="styles.xml"/><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Name</t></si><si><t>Price</t></si><si><r><t>Mug </t></r><r><t>&amp; Saucer</t></r></si><si><t>Stock</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><cols><col min="1" max="1"/></cols><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>1150.5</v></c><c r="C2"/></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>Cap</t></is></c><c r="C3"><v>4</v></c></row>
      <row r="4"/>
    </sheetData></worksheet>`,
  };
  it.each([true, false])("reads the first sheet (deflated: %s)", (compress) => {
    const rows = parseXlsx(zip(files, compress));
    expect(rows).toEqual([
      ["Name", "Price", "Stock"],
      ["Mug & Saucer", "1150.5", ""],
      ["Cap", "", "4"],
    ]);
    const { products, dropped } = sheetToProducts(rows);
    expect(products).toMatchObject([{ name: "Mug & Saucer", price: 1150.5, stock: null }]);
    expect(dropped).toBe(1); // Cap has no price
  });
  it("rejects files that aren't a workbook", () => {
    expect(() => parseXlsx(Buffer.from("just some text, definitely not a zip archive"))).toThrow();
  });
});

describe("sanitizeImportedProducts", () => {
  it("re-validates what the browser sends back before saving", () => {
    const [kurta] = parseShopifyProducts(SHOPIFY, "https://shop.example");
    const out = sanitizeImportedProducts([
      JSON.parse(JSON.stringify(kurta)),
      { name: "Hacked", price: -5 },
      { name: "", price: 100 },
      { name: "Script image", price: 100, imageUrl: "javascript:alert(1)", galleryUrls: ["https://ok.example/a.jpg"], stock: "7" },
      "nonsense",
    ]);
    expect(out.map((p) => p.name)).toEqual(["Lawn Kurta", "Script image"]);
    expect(out[0]).toMatchObject({ price: kurta.price, optionTypes: kurta.optionTypes, imageUrl: kurta.imageUrl, galleryUrls: kurta.galleryUrls });
    expect(out[0].variants.map((v) => [v.options, v.price, v.stock, v.sku])).toEqual(kurta.variants.map((v) => [v.options, v.price, v.stock, v.sku]));
    expect(out[1]).toMatchObject({ imageUrl: "https://ok.example/a.jpg", galleryUrls: [], stock: 7 });
  });
});
