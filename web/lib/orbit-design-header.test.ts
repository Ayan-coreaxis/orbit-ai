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
