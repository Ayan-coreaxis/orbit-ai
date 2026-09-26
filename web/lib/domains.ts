import { randomBytes } from "crypto";
import { resolve4, resolveCname, resolveTxt } from "dns/promises";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/public-url";

/**
 * A seller's own domain for their store (e.g. shop.mybrand.pk).
 *  1. The seller adds the domain → Orbit gives them two DNS records: a TXT record proving they own
 *     it, and a CNAME (subdomain) or A record (bare domain) pointing it at Orbit.
 *  2. "Check" looks the records up in public DNS and reports exactly what's still wrong.
 *  3. Once both are right the domain is verified; proxy.ts then serves the store on it.
 * Hosting: on Vercel (VERCEL_TOKEN + VERCEL_PROJECT_ID) the domain is added to the project so
 * Vercel issues its SSL certificate; on a VPS, Caddy's on-demand TLS asks /api/domains/allowed.
 */

export class DomainError extends Error {}

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VERIFY_LABEL = "_orbit-verify";

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split("/")[0].split("?")[0].split("#")[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!HOST_RE.test(d)) throw new DomainError("That doesn't look like a domain — type it like shop.mybrand.pk or mybrand.com.");
  const app = appHost();
  if (app && (d === app || d.endsWith(`.${app}`))) throw new DomainError("That's Orbit's own address — use a domain you own.");
  if (/(^|\.)(vercel\.app|localhost|r2\.dev)$/.test(d)) throw new DomainError("Use a domain you own.");
  return d;
}

export function appHost(): string | null {
  try {
    return new URL(appBaseUrl()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A bare domain (mybrand.com) can't have a CNAME at most registrars — it needs an A record. */
export function isApex(domain: string): boolean {
  const parts = domain.split(".");
  // Common two-part public suffixes (.com.pk, .co.uk …) make "mybrand.com.pk" an apex too.
  const twoPart = /^(com|net|org|edu|gov|co|web|biz|ac)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.length === (twoPart ? 3 : 2);
}

export function dnsTargets() {
  const vercel = !!process.env.VERCEL_TOKEN && !!process.env.VERCEL_PROJECT_ID;
  return {
    cname: process.env.STORE_DOMAIN_CNAME?.trim() || (vercel ? "cname.vercel-dns.com" : appHost()),
    ip: process.env.STORE_DOMAIN_IP?.trim() || (vercel ? "76.76.21.21" : null),
    vercel,
  };
}

export type DnsRecord = { type: "TXT" | "CNAME" | "A"; host: string; name: string; value: string; ok?: boolean; found?: string[] };

/** The records the seller must add, in the shape registrar screens use (Host / Value). */
export function requiredRecords(domain: string, token: string): DnsRecord[] {
  const t = dnsTargets();
  const apex = isApex(domain);
  const sub = apex ? "@" : domain.split(".")[0];
  const verifyHost = apex ? VERIFY_LABEL : `${VERIFY_LABEL}.${sub}`;
  const records: DnsRecord[] = [{ type: "TXT", host: verifyHost, name: `${VERIFY_LABEL}.${domain}`, value: `orbit-verify=${token}` }];
  if (apex) {
    if (t.ip) records.push({ type: "A", host: "@", name: domain, value: t.ip });
    else if (t.cname) records.push({ type: "CNAME", host: "@", name: domain, value: t.cname }); // works where the registrar supports ALIAS/CNAME flattening
  } else if (t.cname) {
    records.push({ type: "CNAME", host: sub, name: domain, value: t.cname });
  }
  return records;
}

export async function setDomain(businessId: string, input: string) {
  const domain = normalizeDomain(input);
  const taken = await prisma.business.findFirst({ where: { customDomain: domain, NOT: { id: businessId } }, select: { id: true } });
  if (taken) throw new DomainError("That domain is already connected to another store.");
  const current = await prisma.business.findUnique({ where: { id: businessId }, select: { customDomain: true } });
  if (current?.customDomain && current.customDomain !== domain) await removeFromHost(current.customDomain);
  return prisma.business.update({
    where: { id: businessId },
    data: {
      customDomain: domain,
      customDomainToken: randomBytes(12).toString("hex"),
      customDomainStatus: "pending",
      customDomainVerifiedAt: null,
      customDomainCheckedAt: null,
      customDomainNote: "Add the DNS records below, then press Check.",
    },
  });
}

export async function removeDomain(businessId: string) {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { customDomain: true } });
  if (b?.customDomain) await removeFromHost(b.customDomain);
  await prisma.business.update({
    where: { id: businessId },
    data: { customDomain: null, customDomainToken: null, customDomainStatus: null, customDomainVerifiedAt: null, customDomainCheckedAt: null, customDomainNote: null },
  });
  forgetDomain(b?.customDomain ?? "");
}

type Resolvers = { txt: typeof resolveTxt; cname: typeof resolveCname; a: typeof resolve4 };
const realDns: Resolvers = { txt: resolveTxt, cname: resolveCname, a: resolve4 };

/** Look the records up in public DNS; verify when both are right. */
export async function checkDomain(businessId: string, dns: Resolvers = realDns) {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { customDomain: true, customDomainToken: true } });
  if (!b?.customDomain || !b.customDomainToken) throw new DomainError("Add a domain first.");
  const records = requiredRecords(b.customDomain, b.customDomainToken);
  const norm = (s: string) => s.toLowerCase().replace(/\.$/, "");
  for (const r of records) {
    try {
      if (r.type === "TXT") {
        r.found = (await dns.txt(r.name)).map((chunks) => chunks.join(""));
        r.ok = r.found.includes(r.value);
      } else if (r.type === "CNAME") {
        r.found = (await dns.cname(r.name)).map(norm);
        r.ok = r.found.includes(norm(r.value));
        // A flattened/ALIAS apex shows up as A records instead — accept if they match the target's.
        if (!r.ok && r.host === "@") {
          const [mine, target] = await Promise.all([dns.a(r.name).catch((): string[] => []), dns.a(r.value).catch((): string[] => [])]);
          r.ok = mine.length > 0 && mine.every((ip) => target.includes(ip));
          if (r.ok) r.found = mine;
        }
      } else {
        r.found = await dns.a(r.name);
        r.ok = r.found.includes(r.value);
      }
    } catch {
      r.found = [];
      r.ok = false;
    }
  }
  const allOk = records.every((r) => r.ok);
  const problems = records
    .filter((r) => !r.ok)
    .map((r) =>
      r.found?.length
        ? `The ${r.type} record for ${r.host} points to ${r.found.join(", ")} — it should be ${r.value}.`
        : `No ${r.type} record found for ${r.host} yet (DNS changes can take from a few minutes up to a few hours).`,
    );
  let note = allOk ? "Verified — your store is live on this domain. The secure (https) certificate can take a few minutes the first time." : problems.join(" ");
  let status: "verified" | "pending" = allOk ? "verified" : "pending";
  if (allOk) {
    const hosted = await addToHost(b.customDomain);
    if (!hosted.ok) {
      status = "pending";
      note = `DNS is right, but connecting the domain on Orbit's hosting failed: ${hosted.error}`;
    }
  }
  await prisma.business.update({
    where: { id: businessId },
    data: {
      customDomainStatus: status,
      customDomainCheckedAt: new Date(),
      customDomainNote: note.slice(0, 600),
      ...(status === "verified" ? { customDomainVerifiedAt: new Date() } : {}),
    },
  });
  forgetDomain(b.customDomain);
  return { status, note, records };
}

// ---------- Hosting (Vercel) ----------

async function vercel(path: string, init: RequestInit): Promise<Response> {
  const team = process.env.VERCEL_TEAM_ID ? `${path.includes("?") ? "&" : "?"}teamId=${process.env.VERCEL_TEAM_ID}` : "";
  return fetch(`https://api.vercel.com${path}${team}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
}

async function addToHost(domain: string): Promise<{ ok: boolean; error?: string }> {
  if (!dnsTargets().vercel) return { ok: true }; // VPS: Caddy asks /api/domains/allowed before issuing a certificate
  try {
    const res = await vercel(`/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
    if (res.ok) return { ok: true };
    const d = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    if (d.error?.code === "domain_already_in_use" || d.error?.code === "domain_already_exists" || res.status === 409) return { ok: true };
    return { ok: false, error: d.error?.message ?? `Vercel error ${res.status}` };
  } catch {
    return { ok: false, error: "Couldn't reach Vercel." };
  }
}

async function removeFromHost(domain: string) {
  if (!dnsTargets().vercel) return;
  await vercel(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" }).catch(() => {});
}

// ---------- Host → store lookup (used by proxy.ts on every storefront request) ----------

const cache = new Map<string, { businessId: string | null; until: number }>();

export function forgetDomain(domain: string) {
  cache.delete(domain);
}

export async function businessForHost(host: string): Promise<string | null> {
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const hit = cache.get(h);
  if (hit && hit.until > Date.now()) return hit.businessId;
  const b = await prisma.business.findFirst({ where: { customDomain: h, customDomainStatus: "verified" }, select: { id: true } });
  cache.set(h, { businessId: b?.id ?? null, until: Date.now() + 60_000 });
  return b?.id ?? null;
}
