import { prisma } from "@/lib/prisma";
import { GRAPH_BASE, NEEDED_PERMISSIONS, getAdAccounts, getManagedPages, isMetaAppConfigured, type AdAccountInfo, type ConnectedPage } from "@/lib/meta-oauth";
import { appIsPublic, publicFileUrl, publicStoreUrl } from "@/lib/public-url";
import { pageSubscribed, subscribePage } from "@/lib/meta-messaging";

/**
 * One honest answer to "is Meta ready?": the connection, the permissions actually granted, the
 * Page / Instagram / ad account in use, token expiry, and whether Meta can reach the store and files.
 * Each check says what to do when it fails.
 */

export type Check = { id: string; label: string; ok: boolean; fix?: string };

export async function metaHealth(businessId: string) {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { metaPageId: true, metaPageName: true, metaInstagramUserId: true, metaAdAccountId: true, metaUserToken: true, metaUserTokenExpiresAt: true, metaAccessToken: true },
  });
  const checks: Check[] = [];
  const configured = isMetaAppConfigured();
  checks.push({ id: "app", label: "Orbit's Meta app is set up", ok: configured, fix: "The platform owner adds the Meta App ID / Secret in Super Admin > API Keys." });
  const connected = !!b?.metaPageId && !!b.metaAccessToken;
  checks.push({ id: "page", label: connected ? `Facebook Page: ${b?.metaPageName ?? b?.metaPageId}` : "Facebook Page connected", ok: connected, fix: "Press Connect Instagram & Facebook below." });

  let granted: string[] = [];
  let pages: ConnectedPage[] = [];
  let accounts: AdAccountInfo[] = [];
  let tokenError: string | null = null;
  if (b?.metaUserToken) {
    try {
      const res = await fetch(`${GRAPH_BASE}/me/permissions?access_token=${encodeURIComponent(b.metaUserToken)}`, { signal: AbortSignal.timeout(15000) });
      const d = (await res.json()) as { data?: { permission: string; status: string }[]; error?: { message?: string } };
      if (!res.ok) tokenError = d.error?.message ?? "Meta didn't accept the saved login.";
      granted = (d.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
      [pages, accounts] = await Promise.all([getManagedPages(b.metaUserToken).catch(() => []), getAdAccounts(b.metaUserToken)]);
    } catch {
      tokenError = "Couldn't reach Meta to check the connection.";
    }
  }
  if (connected) {
    checks.push({
      id: "login",
      label: !b?.metaUserToken ? "Reconnect once — ads and switching Pages need a newer permission" : tokenError ? `Meta login problem: ${tokenError}` : "Meta login is valid",
      ok: !!b?.metaUserToken && !tokenError,
      fix: "Press Reconnect below and approve every permission.",
    });
    const exp = b?.metaUserTokenExpiresAt;
    if (exp) {
      const days = Math.floor((exp.getTime() - Date.now()) / 86400000);
      checks.push({ id: "expiry", label: days > 7 ? `Login valid for ${days} more days` : days > 0 ? `Login expires in ${days} days` : "Login expired", ok: days > 7, fix: "Reconnect to renew it (Meta logins last about 60 days)." });
    }
    for (const [feature, perms] of Object.entries(NEEDED_PERMISSIONS)) {
      if (!b?.metaUserToken || tokenError) break;
      const missing = perms.filter((p) => !granted.includes(p));
      checks.push({ id: `perm:${feature}`, label: missing.length ? `${feature}: missing permission ${missing.join(", ")}` : `${feature}: allowed`, ok: !missing.length, fix: "Reconnect and tick every permission Meta asks about. Until Meta approves Orbit's app, only people added to the app as testers can use these." });
    }
    checks.push({
      id: "instagram",
      label: b?.metaInstagramUserId ? "Instagram professional account linked" : "No Instagram professional account linked to this Page",
      ok: !!b?.metaInstagramUserId,
      fix: "In the Instagram app: Settings > Account type > switch to Professional, link it to your Facebook Page, then reconnect here.",
    });
    if (b?.metaPageId && b.metaAccessToken && process.env.META_WEBHOOK_VERIFY_TOKEN) {
      let subscribed = await pageSubscribed(b.metaPageId, b.metaAccessToken);
      if (subscribed === false) subscribed = (await subscribePage(b.metaPageId, b.metaAccessToken)).ok; // fix it on the spot
      checks.push({
        id: "dms",
        label: subscribed ? "Messenger & Instagram DMs reach your store chatbot" : "DMs aren't reaching Orbit yet",
        ok: !!subscribed,
        fix: "Reconnect and allow messaging permissions. Until Meta approves Orbit's app, only app testers' messages arrive.",
      });
    }
    const acct = accounts.find((a) => a.id === b?.metaAdAccountId);
    checks.push({
      id: "adaccount",
      label: !b?.metaAdAccountId ? "No ad account connected" : acct ? `Ad account: ${acct.name}${acct.currency ? ` (${acct.currency})` : ""}${acct.account_status === 1 ? "" : " — not active"}` : "Ad account connected",
      ok: !!b?.metaAdAccountId && (!acct || acct.account_status === 1),
      fix: "Create or fix an ad account in Meta Ads Manager (add a payment method), then pick it below.",
    });
  }
  const store = await publicStoreUrl(businessId);
  checks.push({ id: "store", label: store ? `Store is public at ${store.replace(/^https:\/\//, "")}` : "Store has no public address yet (ads need one)", ok: !!store, fix: "Connect your own domain in Settings > Domain, or put Orbit on its public domain." });
  const files = publicFileUrl("/uploads/x") !== null || appIsPublic();
  checks.push({ id: "files", label: files ? "Photos & videos are reachable by Instagram" : "Instagram can't fetch your photos yet", ok: files, fix: "Connect Cloudflare R2 in Super Admin > Storage (or put Orbit on its public domain)." });

  return {
    configured,
    connected,
    ready: checks.every((c) => c.ok),
    checks,
    pages: pages.map((p) => ({ id: p.id, name: p.name, hasInstagram: !!p.instagram_business_account })),
    adAccounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency ?? null, active: a.account_status === 1 })),
    current: { pageId: b?.metaPageId ?? null, adAccountId: b?.metaAdAccountId ?? null },
  };
}

/** Switch which Page (and its Instagram) or which ad account Orbit uses. */
export async function chooseMetaAssets(businessId: string, opts: { pageId?: string; adAccountId?: string }) {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { metaUserToken: true } });
  if (!b?.metaUserToken) throw new Error("Reconnect Meta first.");
  const data: Record<string, unknown> = {};
  if (opts.pageId) {
    const page = (await getManagedPages(b.metaUserToken)).find((p) => p.id === opts.pageId);
    if (!page) throw new Error("That Page isn't one you manage.");
    Object.assign(data, { metaPageId: page.id, metaPageName: page.name, metaAccessToken: page.access_token, metaInstagramUserId: page.instagram_business_account?.id ?? null });
    await subscribePage(page.id, page.access_token).catch(() => {});
  }
  if (opts.adAccountId) {
    const acct = (await getAdAccounts(b.metaUserToken)).find((a) => a.id === opts.adAccountId);
    if (!acct) throw new Error("That ad account isn't one you can use.");
    data.metaAdAccountId = acct.id;
  }
  if (Object.keys(data).length) await prisma.business.update({ where: { id: businessId }, data });
}
