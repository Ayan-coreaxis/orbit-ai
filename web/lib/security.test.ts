import { afterEach, describe, expect, it, vi } from "vitest";
import { signToken, verifyToken } from "@/lib/signed-token";
import { assertPublicUrl, isPrivateIp } from "@/lib/safe-fetch";
import { cronAllowed } from "@/lib/guard";

describe("signed tokens", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("only verify for the same purpose and before expiry", () => {
    vi.stubEnv("AUTH_SECRET", "s");
    const t = signToken("user", "u1", 60);
    expect(verifyToken("user", t)).toBe("u1");
    expect(verifyToken("admin", t)).toBeNull();
    expect(verifyToken("shop:b1", t)).toBeNull();
    expect(verifyToken("user", signToken("user", "u1", -1))).toBeNull();
    const forged = Buffer.from(`admin.admin.${Math.floor(Date.now() / 1000) + 99}.deadbeef`).toString("base64url");
    expect(verifyToken("admin", forged)).toBeNull();
    vi.stubEnv("AUTH_SECRET", "other");
    expect(verifyToken("user", t)).toBeNull();
  });
});

describe("SSRF guard", () => {
  it("knows private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "104.18.1.1", "2606:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("refuses internal URLs", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("https://user:pw@example.com")).rejects.toThrow();
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeInstanceOf(URL);
  });
});

describe("cron guard", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is closed in production without the secret", () => {
    const req = (auth?: string) => new Request("https://x/api/cron/a", { headers: auth ? { authorization: auth } : {} });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAllowed(req())).toBe(false);
    vi.stubEnv("CRON_SECRET", "abc");
    expect(cronAllowed(req("Bearer abc"))).toBe(true);
    expect(cronAllowed(req("Bearer x"))).toBe(false);
  });
});
