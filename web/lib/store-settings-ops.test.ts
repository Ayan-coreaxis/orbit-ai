import { describe, expect, it } from "vitest";
import { sanitizeStoreChanges, splitPendingOps } from "./store-settings-ops";

describe("store changes — delivery zones", () => {
  it("keeps a well-formed zone and cleans it", () => {
    const out = sanitizeStoreChanges([
      { setting: "shipping_zone", value: { name: " Lahore ", cities: ["Lahore", "lahore", " ", 5], fee: "150", freeOver: null } },
    ]);
    expect(out).toEqual([{ op: "store_setting", setting: "shipping_zone", value: { name: "Lahore", cities: ["Lahore", "lahore"], fee: 150, freeOver: null } }]);
  });

  it("drops zones without a name, cities or a valid fee", () => {
    expect(
      sanitizeStoreChanges([
        { setting: "shipping_zone", value: { name: "", cities: ["Lahore"], fee: 100 } },
        { setting: "shipping_zone", value: { name: "X", cities: [], fee: 100 } },
        { setting: "shipping_zone", value: { name: "X", cities: ["Lahore"], fee: -5 } },
        { setting: "shipping_zone", value: "Lahore 150" },
      ]),
    ).toEqual([]);
  });

  it("parses removals and survives the pending-ops round trip", () => {
    const raw = JSON.stringify([
      { op: "store_setting", setting: "remove_shipping_zone", value: "Karachi" },
      { op: "store_setting", setting: "shipping_fee", value: 250 },
    ]);
    const { storeChanges, planOps } = splitPendingOps(raw);
    expect(planOps).toEqual([]);
    expect(storeChanges.map((c) => c.setting)).toEqual(["remove_shipping_zone", "shipping_fee"]);
  });
});
