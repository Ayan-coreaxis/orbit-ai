import { describe, expect, it } from "vitest";
import { buildFeedItems, buildGoogleFeedXml, buildMetaFeedCsv, csvCell, escapeXml, feedPrice, plainText, META_CSV_COLUMNS, type FeedProduct, type FeedStore } from "@/lib/product-feed";

const store: FeedStore = { name: "Noor & Co", currency: "pkr", baseUrl: "https://noor.pk", assetBase: "https://app.orbit.test" };

const simple: FeedProduct = {
  id: "p1",
  name: "Lawn Suit <3-piece>",
  description: "<p>Soft &amp; light lawn.</p><ul><li>3 pieces</li><li>Unstitched</li></ul>",
  price: 2450,
  stock: 4,
  imageUrl: "/uploads/a.jpg",
  galleryUrls: ["https://cdn.x/b.jpg", "/uploads/a.jpg", "https://cdn.x/b.jpg"],
  category: "Women",
  variants: [],
};

const withVariants: FeedProduct = {
  id: "p2",
  name: "Kurta",
  description: null,
  price: 1800,
  stock: 99, // ignored when there are variants
  imageUrl: "https://cdn.x/kurta.jpg",
  galleryUrls: [],
  category: null,
  variants: [
    { id: "v1", label: "M / Black", options: { Size: "M", Color: "Black" }, price: null, stock: 3, imageUrl: null },
    { id: "v2", label: "L / Sand", options: { size: "L", Colour: "Sand" }, price: 1950.5, stock: 0, imageUrl: "/uploads/sand.jpg" },
  ],
};

describe("feed text helpers", () => {
  it("formats prices as '2450.00 PKR'", () => {
    expect(feedPrice(2450, "pkr")).toBe("2450.00 PKR");
    expect(feedPrice(19.5, "USD")).toBe("19.50 USD");
  });

  it("turns rich text into trimmed plain text", () => {
    expect(plainText(simple.description)).toBe("Soft & light lawn.\n3 pieces\nUnstitched");
    expect(plainText("<script>alert(1)</script>Hi&nbsp;there &#39;x&#39;")).toBe("Hi there 'x'");
    expect(plainText(null)).toBe("");
    expect(plainText("a".repeat(50), 10)).toHaveLength(10);
  });

  it("escapes XML and drops characters XML can't hold", () => {
    expect(escapeXml(`Tom & "Jerry" <b>'s</b>`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;b&gt;&apos;s&lt;/b&gt;");
    expect(escapeXml("a\u0000b\u000Bc\nd")).toBe("abc\nd");
  });

  it("quotes CSV cells only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildFeedItems", () => {
  it("makes one item for a simple product, from real fields only", () => {
    const [item, ...rest] = buildFeedItems(store, [simple]);
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({
      id: "p1",
      title: "Lawn Suit <3-piece>",
      link: "https://noor.pk/product/p1",
      imageLink: "https://app.orbit.test/uploads/a.jpg",
      additionalImageLinks: ["https://cdn.x/b.jpg"],
      inStock: true,
      price: "2450.00 PKR",
      brand: "Noor & Co",
      itemGroupId: null,
      size: null,
      color: null,
      productType: "Women",
    });
  });

  it("makes one item per variant, grouped, with its own price, stock, size and colour", () => {
    const items = buildFeedItems(store, [withVariants]);
    expect(items.map((i) => i.id)).toEqual(["v1", "v2"]);
    expect(items[0]).toMatchObject({ title: "Kurta - M / Black", itemGroupId: "p2", size: "M", color: "Black", price: "1800.00 PKR", inStock: true, imageLink: "https://cdn.x/kurta.jpg" });
    expect(items[1]).toMatchObject({ itemGroupId: "p2", size: "L", color: "Sand", price: "1950.50 PKR", inStock: false, imageLink: "https://app.orbit.test/uploads/sand.jpg" });
    expect(items[1].additionalImageLinks).toEqual(["https://cdn.x/kurta.jpg"]);
    // No description written by the seller → the product's own name, nothing invented.
    expect(items[0].description).toBe("Kurta");
    expect(items[0].productType).toBeNull();
  });

  it("marks a simple product out of stock at zero and leaves out products with no photo or price", () => {
    const items = buildFeedItems(store, [
      { ...simple, id: "a", stock: 0 },
      { ...simple, id: "b", imageUrl: null, galleryUrls: [] },
      { ...simple, id: "c", price: 0 },
    ]);
    expect(items.map((i) => [i.id, i.inStock])).toEqual([["a", false]]);
  });
});

describe("Google feed XML", () => {
  const xml = buildGoogleFeedXml(store, buildFeedItems(store, [simple, withVariants]));

  it("is RSS 2.0 with the g: namespace and escaped values", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<title>Noor &amp; Co</title>");
    expect(xml).toContain("<g:title>Lawn Suit &lt;3-piece&gt;</g:title>");
    expect(xml).toContain("<g:description>Soft &amp; light lawn.\n3 pieces\nUnstitched</g:description>");
    expect(xml).toContain("<g:brand>Noor &amp; Co</g:brand>");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("carries price, availability, condition, grouping and never a GTIN/MPN", () => {
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml).toContain("<g:price>2450.00 PKR</g:price>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(xml.match(/<g:condition>new<\/g:condition>/g)).toHaveLength(3);
    expect(xml.match(/<g:identifier_exists>no<\/g:identifier_exists>/g)).toHaveLength(3);
    expect(xml.match(/<g:item_group_id>p2<\/g:item_group_id>/g)).toHaveLength(2);
    expect(xml).toContain("<g:size>M</g:size>");
    expect(xml).toContain("<g:color>Sand</g:color>");
    expect(xml).toContain("<g:product_type>Women</g:product_type>");
    expect(xml).toContain("<g:additional_image_link>https://cdn.x/b.jpg</g:additional_image_link>");
    expect(xml).not.toMatch(/g:gtin|g:mpn/);
  });
});

describe("Meta feed CSV", () => {
  it("has the catalog columns and quotes cells with commas, quotes and line breaks", () => {
    const csv = buildMetaFeedCsv(buildFeedItems(store, [{ ...simple, name: 'Suit, "Eid" edition' }, withVariants]));
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(META_CSV_COLUMNS.join(","));
    expect(lines[0]).toBe("id,title,description,availability,condition,price,link,image_link,brand,item_group_id,additional_image_link,size,color,product_type");
    expect(csv).toContain('p1,"Suit, ""Eid"" edition","Soft & light lawn.\n3 pieces\nUnstitched",in stock,new,2450.00 PKR,https://noor.pk/product/p1,https://app.orbit.test/uploads/a.jpg,Noor & Co,,https://cdn.x/b.jpg,,,Women');
    expect(lines.at(-1)).toBe("v2,Kurta - L / Sand,Kurta,out of stock,new,1950.50 PKR,https://noor.pk/product/p2,https://app.orbit.test/uploads/sand.jpg,Noor & Co,p2,https://cdn.x/kurta.jpg,L,Sand,");
  });
});
