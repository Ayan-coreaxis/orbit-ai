import { describe, it, expect } from "vitest";
import {
  parseOptionTypes,
  hasVariants,
  cartesian,
  comboKey,
  comboLabel,
  reconcileVariants,
  resolvePurchasable,
  totalStock,
} from "./variants";

describe("parseOptionTypes", () => {
  it("dedupes + caps values, drops empty axes, caps at 2 axes", () => {
    const t = parseOptionTypes(
      JSON.stringify([
        { name: "Size", values: ["S", "M", "M", "L", ""] },
        { name: "", values: ["x"] },
        { name: "Color", values: ["Red"] },
        { name: "Extra", values: ["y"] },
      ]),
    );
    expect(t).toEqual([
      { name: "Size", values: ["S", "M", "L"] },
      { name: "Color", values: ["Red"] },
    ]);
  });
  it("returns [] for junk", () => {
    expect(parseOptionTypes(null)).toEqual([]);
    expect(parseOptionTypes("not json")).toEqual([]);
    expect(parseOptionTypes("[]")).toEqual([]);
  });
});

describe("cartesian", () => {
  it("produces every combination", () => {
    const combos = cartesian([
      { name: "Size", values: ["S", "M"] },
      { name: "Color", values: ["Red", "Blue"] },
    ]);
    expect(combos).toHaveLength(4);
    expect(combos).toContainEqual({ Size: "M", Color: "Blue" });
  });
  it("is empty when an axis has no values", () => {
    expect(cartesian([{ name: "Size", values: [] }])).toEqual([]);
  });
});

describe("comboKey / comboLabel", () => {
  it("comboKey is order-independent", () => {
    expect(comboKey({ Size: "M", Color: "Red" })).toBe(comboKey({ Color: "Red", Size: "M" }));
  });
  it("comboLabel follows option-type order", () => {
    const types = [
      { name: "Size", values: ["M"] },
      { name: "Color", values: ["Red"] },
    ];
    expect(comboLabel({ Color: "Red", Size: "M" }, types)).toBe("M / Red");
  });
});

describe("reconcileVariants", () => {
  it("keeps existing rows by combo and adds new ones at stock 0", () => {
    const types = [{ name: "Size", values: ["S", "M", "L"] }];
    const incoming = [
      { id: "v1", label: "S", options: { Size: "S" }, price: null, stock: 7 },
      { id: "v2", label: "M", options: { Size: "M" }, price: 99, stock: 3 },
    ];
    const out = reconcileVariants(types, incoming);
    expect(out).toHaveLength(3);
    expect(out.find((v) => v.options.Size === "S")).toMatchObject({ id: "v1", stock: 7 });
    expect(out.find((v) => v.options.Size === "M")).toMatchObject({ id: "v2", price: 99, stock: 3 });
    expect(out.find((v) => v.options.Size === "L")).toMatchObject({ id: undefined, stock: 0 });
  });
});

describe("resolvePurchasable", () => {
  const variants = [
    { id: "v1", label: "S", price: null, stock: 5 },
    { id: "v2", label: "M", price: 120, stock: 0 },
  ];
  it("plain product with no option types", () => {
    const r = resolvePurchasable({ price: 100, stock: 4 }, []);
    expect(r).toEqual({ price: 100, stock: 4, label: null, variantId: null });
  });
  it("requires a variant when the product has axes", () => {
    const p = { price: 100, optionTypes: JSON.stringify([{ name: "Size", values: ["S", "M"] }]) };
    expect(resolvePurchasable(p, variants)).toHaveProperty("error");
    expect(resolvePurchasable(p, variants, "v2")).toEqual({ price: 120, stock: 0, label: "M", variantId: "v2" });
    expect(resolvePurchasable(p, variants, "v1")).toMatchObject({ price: 100, stock: 5 }); // falls back to product price
  });
});

describe("totalStock", () => {
  it("sums variant stock when variants exist, else product stock", () => {
    const opts = JSON.stringify([{ name: "Size", values: ["S", "M"] }]);
    expect(totalStock({ stock: 99, optionTypes: opts }, [{ stock: 2 }, { stock: 3 }])).toBe(5);
    expect(totalStock({ stock: 8, optionTypes: null }, [])).toBe(8);
  });
});

describe("hasVariants", () => {
  it("true only when every axis has values", () => {
    expect(hasVariants([{ name: "Size", values: ["S"] }])).toBe(true);
    expect(hasVariants([{ name: "Size", values: [] }])).toBe(false);
    expect(hasVariants([])).toBe(false);
  });
});
