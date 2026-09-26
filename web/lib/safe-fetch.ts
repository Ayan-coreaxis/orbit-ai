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

function privateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparseable → refuse
  const [a, b] = p;
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

/** "::ffff:7f00:1" → [0,0,0,0,0,0xffff,0x7f00,1]; handles "::", embedded dotted IPv4 and zone ids. */
function expandV6(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0];
  const dotted = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const q = dotted[1].split(".").map(Number);
    v = v.slice(0, -dotted[1].length) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  const nums = parts.map((h) => parseInt(h, 16));
  return nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff) ? null : nums;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return privateV4(ip);
  if (!net.isIPv6(ip)) return true;
  const h = expandV6(ip);
  if (!h) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zeros = (n: number) => h.slice(0, n).every((x) => x === 0);
  if (zeros(5) && h[5] === 0xffff) return privateV4(v4(h[6], h[7])); // IPv4-mapped
  if (zeros(6)) return h[6] === 0 && h[7] <= 1 ? true : privateV4(v4(h[6], h[7])); // ::, ::1, IPv4-compatible
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(0)) return privateV4(v4(h[6], h[7])); // NAT64
  if (h[0] === 0x2002) return privateV4(v4(h[1], h[2])); // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true; // link / site local
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
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
      const next = await assertPublicUrl(new URL(loc, url));
      // Like browsers: never carry credentials to a different site.
      if (next.origin !== url.origin && init.headers) {
        const h = new Headers(init.headers);
        h.delete("authorization");
        h.delete("cookie");
        h.delete("token");
        h.delete("x-api-key");
        init = { ...init, headers: h };
      }
      url = next;
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
