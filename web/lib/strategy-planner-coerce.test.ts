import { describe, expect, it } from "vitest";
import { coerceArray } from "@/lib/strategy-planner";

describe("coerceArray", () => {
  it("keeps a real array", () => {
    expect(coerceArray([{ title: "a" }])).toEqual([{ title: "a" }]);
  });
  it("parses a JSON string", () => {
    expect(coerceArray('[{"title":"a"}]')).toEqual([{ title: "a" }]);
  });
  it("recovers an array wrapped in stray text", () => {
    expect(coerceArray('Here you go: [{"title":"a"}] done')).toEqual([{ title: "a" }]);
  });
  it("unwraps one level of object", () => {
    expect(coerceArray({ strategies: [{ title: "a" }] })).toEqual([{ title: "a" }]);
  });
  it("gives [] for junk", () => {
    expect(coerceArray("not json")).toEqual([]);
    expect(coerceArray(undefined)).toEqual([]);
  });
});
