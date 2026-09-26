import { describe, expect, it } from "vitest";
import { canonicalCity } from "@/lib/pk-cities";

describe("canonicalCity", () => {
  it("treats common spellings as the same city", () => {
    for (const v of ["Lahore", " lahore city ", "LHR", "Lahore, Pakistan"]) expect(canonicalCity(v)).toBe("lahore");
    expect(canonicalCity("Pindi")).toBe("rawalpindi");
    expect(canonicalCity("D.G. Khan")).toBe("dera ghazi khan");
    expect(canonicalCity("Wah Cantt")).toBe("wah cantt");
    expect(canonicalCity("Isb")).toBe("islamabad");
    expect(canonicalCity("")).toBe("");
  });
});
