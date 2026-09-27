import { describe, expect, it } from "vitest";
import { canonicalCity, displayCity } from "@/lib/pk-cities";

describe("canonicalCity", () => {
  it("treats common spellings as the same city", () => {
    for (const v of ["Lahore", " lahore city ", "LHR", "Lahore, Pakistan"]) expect(canonicalCity(v)).toBe("lahore");
    expect(canonicalCity("Pindi")).toBe("rawalpindi");
    expect(canonicalCity("D.G. Khan")).toBe("dera ghazi khan");
    expect(canonicalCity("Wah Cantt")).toBe("wah cantt");
    expect(canonicalCity("Isb")).toBe("islamabad");
    expect(canonicalCity("")).toBe("");
    expect(canonicalCity("Lahore City, Pakistan")).toBe("lahore");
    expect(canonicalCity("Lahore Cantt")).toBe("lahore");
    expect(canonicalCity("Karachi District")).toBe("karachi");
  });
});

describe("displayCity", () => {
  it("spells known cities properly and capitalises the rest", () => {
    expect(displayCity("lahore")).toBe("Lahore");
    expect(displayCity(" LHR ")).toBe("Lahore");
    expect(displayCity("chak jhumra")).toBe("Chak Jhumra");
    expect(displayCity("DHA Phase 5")).toBe("DHA Phase 5");
    expect(displayCity("")).toBe("");
  });
});
