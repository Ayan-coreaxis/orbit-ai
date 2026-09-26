import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validMetaSignature } from "@/lib/meta-messaging";

describe("Meta webhook signature", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only bodies signed with the app secret", () => {
    vi.stubEnv("META_APP_SECRET", "s3cret");
    const raw = JSON.stringify({ object: "page", entry: [] });
    const good = "sha256=" + crypto.createHmac("sha256", "s3cret").update(raw).digest("hex");
    expect(validMetaSignature(raw, good)).toBe(true);
    expect(validMetaSignature(raw + " ", good)).toBe(false);
    expect(validMetaSignature(raw, "sha256=" + "0".repeat(64))).toBe(false);
    expect(validMetaSignature(raw, null)).toBe(false);
    vi.stubEnv("META_APP_SECRET", "");
    expect(validMetaSignature(raw, good)).toBe(false);
  });
});
