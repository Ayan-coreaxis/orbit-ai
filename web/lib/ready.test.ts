import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { fromMinor, minorUnits } from "@/lib/meta-ads";
import { isApex, normalizeDomain, requiredRecords } from "@/lib/domains";
import { validTwilioSignature } from "@/lib/whatsapp";
import { isPublicHttps, publicFileUrl, withUtm } from "@/lib/public-url";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("Meta budget units", () => {
  it("uses cents for most currencies and whole units for zero-decimal ones", () => {
    expect(minorUnits(500, "PKR")).toBe(50000);
    expect(minorUnits(5.5, "usd")).toBe(550);
    expect(minorUnits(1000, "JPY")).toBe(1000);
    expect(fromMinor(26200, "PKR")).toBe(262);
  });
});

describe("custom domains", () => {
  it("normalizes what sellers paste", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.orbit.pk";
    expect(normalizeDomain("https://Shop.MyBrand.pk/products?x=1")).toBe("shop.mybrand.pk");
    expect(normalizeDomain("mybrand.com.")).toBe("mybrand.com");
    expect(() => normalizeDomain("not a domain")).toThrow();
    expect(() => normalizeDomain("app.orbit.pk")).toThrow(/Orbit's own/);
    expect(() => normalizeDomain("x.vercel.app")).toThrow();
  });

  it("knows bare domains from sub-domains, including .com.pk style", () => {
    expect(isApex("mybrand.com")).toBe(true);
    expect(isApex("mybrand.com.pk")).toBe(true);
    expect(isApex("shop.mybrand.com")).toBe(false);
    expect(isApex("shop.mybrand.com.pk")).toBe(false);
  });

  it("gives a TXT + CNAME for a sub-domain and TXT + A for a bare domain", () => {
    process.env.VERCEL_TOKEN = "t";
    process.env.VERCEL_PROJECT_ID = "p";
    const sub = requiredRecords("shop.mybrand.pk", "abc");
    expect(sub).toEqual([
      { type: "TXT", host: "_orbit-verify.shop", name: "_orbit-verify.shop.mybrand.pk", value: "orbit-verify=abc" },
      { type: "CNAME", host: "shop", name: "shop.mybrand.pk", value: "cname.vercel-dns.com" },
    ]);
    const apex = requiredRecords("mybrand.com", "abc");
    expect(apex[1]).toEqual({ type: "A", host: "@", name: "mybrand.com", value: "76.76.21.21" });
  });
});

describe("Twilio signature", () => {
  it("accepts Twilio's signature and rejects anything else", () => {
    process.env.TWILIO_AUTH_TOKEN = "secret-token";
    const url = "https://app.orbit.pk/api/webhooks/twilio/whatsapp";
    const params = { From: "whatsapp:+923001234567", To: "whatsapp:+14155238886", Body: "YES" };
    const data = url + "Body" + "YES" + "From" + params.From + "To" + params.To;
    const sig = crypto.createHmac("sha1", "secret-token").update(data).digest("base64");
    expect(validTwilioSignature(url, params, sig)).toBe(true);
    expect(validTwilioSignature(url, { ...params, Body: "NO" }, sig)).toBe(false);
    expect(validTwilioSignature(url, params, null)).toBe(false);
    expect(validTwilioSignature(url + "?x=1", params, sig)).toBe(false);
  });
});

describe("public URLs", () => {
  it("only treats real public https addresses as reachable by Meta", () => {
    expect(isPublicHttps("https://pub-1.r2.dev/a.jpg")).toBe(true);
    expect(isPublicHttps("http://pub-1.r2.dev/a.jpg")).toBe(false);
    expect(isPublicHttps("https://localhost/a")).toBe(false);
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(publicFileUrl("/uploads/a.jpg")).toBeNull();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.orbit.pk";
    expect(publicFileUrl("/uploads/a.jpg")).toBe("https://app.orbit.pk/uploads/a.jpg");
  });
  it("tags ad links", () => {
    expect(withUtm("https://shop.x.pk/product/1", "orbit-9")).toBe("https://shop.x.pk/product/1?utm_source=meta&utm_medium=paid&utm_campaign=orbit-9");
  });
});
