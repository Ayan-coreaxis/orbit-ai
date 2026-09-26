import net from "net";
import { lookup } from "dns/promises";
import type { Page } from "playwright";

/**
 * SSRF guard for every server-side fetch of a URL that came from a user (competitor sites, the
 * seller's website, catalog links, MCP servers, imported product images): only http(s), and the
 * host must resolve to public IPs only — checked again on every redirect hop.
 * ALLOW_PRIVATE_FETCH=1 turns the IP check off for local testing against mock servers.
 */

export class UnsafeUrlError extends Error {}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UnsafeUrlError("Only http(s) addresses are allowed.");
  if (u.username || u.password) throw new UnsafeUrlError("Addresses with a login in them aren't allowed.");
  if (process.env.ALLOW_PRIVATE_FETCH === "1") return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new UnsafeUrlError("That address isn't public.");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new UnsafeUrlError("That address doesn't exist.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError("That address isn't public.");
  return u;
}

/** fetch() for user-supplied URLs: public hosts only, redirects followed by hand (max 5) and re-checked. */
export async function safeFetch(raw: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertPublicUrl(new URL(loc, url));
      // A redirect turns POST into GET, like browsers do.
      if (res.status !== 307 && res.status !== 308) init = { ...init, method: "GET", body: undefined };
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects.");
}

/** For a headless browser: block every request (page, image, script, redirect) to a non-public host. */
export async function guardBrowserPage(page: Page) {
  await page.route("**/*", async (route) => {
    try {
      await assertPublicUrl(route.request().url());
      await route.continue();
    } catch {
      await route.abort();
    }
  });
}
