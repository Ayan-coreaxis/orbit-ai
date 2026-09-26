import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { hashedUserData } from "@/lib/meta-capi";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("Conversions API user data", () => {
  it("normalises and hashes like Meta expects", () => {
    const u = hashedUserData({ email: "  Ali@Example.COM ", phone: "0300-1234567", name: "Ali Raza Khan", city: "Lahore", country: "PK" });
    expect(u.em).toEqual([sha("ali@example.com")]);
    expect(u.ph).toEqual([sha("923001234567")]);
    expect(u.fn).toEqual([sha("ali")]);
    expect(u.ln).toEqual([sha("khan")]);
    expect(u.ct).toEqual([sha("lahore")]);
    expect(u.country).toEqual([sha("pk")]);
  });

  it("keeps international numbers and skips junk", () => {
    expect(hashedUserData({ phone: "+44 7700 900123" }).ph).toEqual([sha("447700900123")]);
    expect(hashedUserData({ phone: "12", email: "nope" })).toEqual({});
  });
});
