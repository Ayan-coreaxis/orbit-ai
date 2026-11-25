/** Running the store agent for a seller: one job at a time, saved as it goes, with undo and publish. */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { putFile, readStoredFile } from "@/lib/storage";
import { runStoreAgent, STORE_AGENT_MODEL, type AgentRef, type StoreAgentResult } from "@/lib/store-agent";
import { loadDoc } from "@/lib/orbit-design-generate";
import { defaultDoc, type OrbitDesignDoc } from "@/lib/orbit-design";
import { buildRunning, lintSite, manifest, siteEdits, parseBuild, parseSite, type SiteBuild, type StoreSite } from "@/lib/store-site";
import { assertUnderUsageCap, getUsageStatus } from "@/lib/usage-limit";
import { loadSite, siteData } from "@/lib/store-site-data";

const VERSIONS_KEPT = 20;
const money = (env: string, or: number) => {
  const n = Number(process.env[env]);
  return Number.isFinite(n) && n > 0 ? n : or;
};
export const BUILD_BUDGET = () => money("ORBIT_STORE_BUILD_BUDGET", 5);
export const EDIT_BUDGET = () => money("ORBIT_STORE_EDIT_BUDGET", 0.8);

const save = (businessId: string, b: SiteBuild) => prisma.storeDesign.update({ where: { businessId }, data: { siteBuild: JSON.stringify(b) } });

/** Claim the one build slot. Compare-and-swap on the old value, so two clicks can't start two builds. */
export async function startBuild(businessId: string, kind: "build" | "edit"): Promise<SiteBuild | null> {
  const row = await prisma.storeDesign.findUnique({ where: { businessId }, select: { siteBuild: true } });
  if (!row) await prisma.storeDesign.create({ data: { businessId, published: false } }).catch(() => {});
  if (buildRunning(parseBuild(row?.siteBuild))) return null;
  const now = new Date().toISOString();
  const b: SiteBuild = { id: randomUUID(), kind, status: "running", log: [kind === "build" ? "Reading your brief" : "Reading your request"], startedAt: now, beatAt: now, costUsd: 0 };
  const won = await prisma.storeDesign.updateMany({ where: { businessId, siteBuild: row?.siteBuild ?? null }, data: { siteBuild: JSON.stringify(b) } });
  return won.count === 1 ? b : null;
}

async function keepVersion(businessId: string, site: StoreSite, note: string) {
  await prisma.storeSiteVersion.create({ data: { businessId, site: JSON.stringify(site), note: note.slice(0, 200) } });
  const old = await prisma.storeSiteVersion.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, skip: VERSIONS_KEPT, select: { id: true } });
  if (old.length) await prisma.storeSiteVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export async function runBuild(businessId: string, b: SiteBuild, brief: string, references: AgentRef[], resumeFrom: StoreSite | null = null): Promise<{ reply: string; error?: string }> {
  const edit = b.kind === "edit";
  const before = (await loadSite(businessId)).draft;
  b.brief = brief.slice(0, 14000);
  let stop = false;
  // Beat while a long model call is in flight, and pick up the seller's Stop.
  let chain: Promise<unknown> = Promise.resolve();
  const beat = () => {
    chain = chain
      .then(async () => {
        const cur = parseBuild((await prisma.storeDesign.findUnique({ where: { businessId }, select: { siteBuild: true } }))?.siteBuild);
        if (!cur || cur.id !== b.id || cur.stop) {
          stop = true;
          if (cur?.id !== b.id) return; // cleaned, or another build owns the slot now
          b.stop = true;
        }
        b.beatAt = new Date().toISOString();
        await save(businessId, b);
      })
      .catch(() => {});
    return chain;
  };
  const timer = setInterval(beat, 15_000);
  const finish = async (status: SiteBuild["status"], reply: string, result?: StoreAgentResult) => {
    clearInterval(timer);
    await chain;
    const cur = parseBuild((await prisma.storeDesign.findUnique({ where: { businessId }, select: { siteBuild: true } }))?.siteBuild);
    if (cur?.id !== b.id) return;
    Object.assign(b, { status, summary: reply, beatAt: new Date().toISOString(), costUsd: result?.costUsd ?? b.costUsd });
    await prisma.orbitDesignTurn.create({ data: { businessId, role: "assistant", content: reply } });
    await save(businessId, b);
  };
  const owns = () => !stop || b.stop === true;

  try {
    const data = await siteData(businessId);
    if (!data) throw new Error("no business");
    const used = new Set(data.products.flatMap((p) => p.images));
    const media = await prisma.mediaAsset.findMany({ where: { businessId, kind: "image" }, orderBy: { createdAt: "desc" }, take: 60, select: { url: true, name: true } });
    data.media = media.filter((m) => !used.has(m.url)).slice(0, 40);
    // Never past what is left of the plan's monthly AI allowance.
    const left = (await getUsageStatus(businessId)).remainingUsd;
    const budget = Math.min(edit ? EDIT_BUDGET() : BUILD_BUDGET(), left ?? Infinity);
    const result = await runStoreAgent({
      brief,
      data,
      site: resumeFrom ?? (edit ? (before ?? undefined) : undefined),
      edit,
      resume: !!resumeFrom,
      references,
      budgetUsd: budget,
      progress: async (line) => {
        if (b.log.at(-1) !== line) b.log = [...b.log, line].slice(-80);
        await beat();
      },
      onUsage: async (u) => {
        b.costUsd = u.totalUsd;
        await prisma.agentUsage
          .create({ data: { businessId, agentId: "orbit-design-store-agent", model: STORE_AGENT_MODEL, inputTokens: u.input, outputTokens: u.output, costUsd: u.costUsd } })
          .catch(() => {});
      },
      // A new build shows itself as it grows; an edit only replaces the draft once it is finished.
      onSite: async (site) => {
        if (!owns()) return;
        const json = JSON.stringify(site);
        await prisma.storeDesign.update({ where: { businessId }, data: { siteWip: json, ...(!edit && !before ? { site: json } : {}) } });
      },
      shouldStop: () => stop,
    });

    const usable = !!result.site.files["pages/home.html"];
    const hardFaults = lintSite(result.site, data.products.map((p) => p.id)).filter((x) => /cut off|home\.html is missing|site\.css is missing/.test(x));
    const changed = JSON.stringify(result.site) !== JSON.stringify(before ?? { files: {} });
    const keep = usable && changed && owns() && !(before && !edit && result.stopped !== "done") && !(edit && (hardFaults.length > 0 || result.stopped === "stopped"));
    if (keep) {
      if (before) await keepVersion(businessId, before, edit ? brief : "Before the new build");
      await prisma.storeDesign.update({ where: { businessId }, data: { site: JSON.stringify(result.site), ...(result.stopped === "done" ? { siteWip: null } : {}) } });
    } else if (owns() && result.stopped === "done") await prisma.storeDesign.update({ where: { businessId }, data: { siteWip: null } });
    const open = result.issues.length ? ` ${result.issues.length} small thing${result.issues.length === 1 ? "" : "s"} still need attention: ${result.issues.slice(0, 3).join("; ")}.` : "";
    if (result.stopped === "stopped") {
      await finish("stopped", keep ? "Stopped. What was built so far is in the preview. Press Continue to finish it." : "Stopped. Your store hasn't changed. Press Continue to finish the work.", result);
      return { reply: "Stopped." };
    }
    if (!usable || (edit && !changed) || (edit && hardFaults.length)) {
      const reply = result.summary && edit && !changed ? result.summary : "That didn't work out, and nothing was changed. Please try again or word it differently.";
      await finish("failed", reply, result);
      return { reply, error: reply };
    }
    const cut = result.stopped === "budget" || result.stopped === "turns" || result.stopped === "max_tokens" ? " I reached the working limit before finishing. Press Continue to finish it." : "";
    const limit = cut !== "";
    const reply = (result.summary || (limit && !keep ? "" : edit ? "Done. The change is in the preview." : "Your store is ready in the preview.")) + cut + (limit ? "" : open);
    await finish(limit ? "stopped" : "done", reply.trim(), result);
    return { reply };
  } catch (e) {
    console.error("[store-agent]", e);
    const reply = "The work stopped because of a technical problem. Your last version is safe. Press Continue to carry on.";
    await finish("failed", reply).catch(() => {});
    return { reply, error: reply };
  } finally {
    clearInterval(timer);
  }
}

/** Carry on with an interrupted, stopped or cut-off build. Null when there is nothing to continue. */
export async function continueBuild(businessId: string): Promise<(() => Promise<unknown>) | null> {
  const { build, wip } = await loadSite(businessId);
  if (!build || !wip || buildRunning(build) || build.status === "done") return null;
  const b = await startBuild(businessId, build.kind);
  if (!b) return null;
  b.refs = build.refs;
  b.log = ["Carrying on from where it stopped"];
  return async () => {
    const refs: AgentRef[] = [];
    for (const u of build.refs ?? []) {
      const buf = await readStoredFile(u).catch(() => null);
      if (buf) refs.push({ mediaType: "image/webp", data: buf.toString("base64") });
    }
    await runBuild(businessId, b, build.brief ?? "Finish this store.", refs, wip);
  };
}

/** Keep the seller's reference pictures so a continued build can still see them. */
export async function keepRefs(businessId: string, b: SiteBuild, refs: AgentRef[]) {
  const urls: string[] = [];
  for (const r of refs.slice(0, 8)) {
    try {
      const webp = await sharp(Buffer.from(r.data, "base64")).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      urls.push(await putFile(`uploads/${businessId}/refs/${randomUUID()}.webp`, webp, "image/webp"));
    } catch {
      /* the build itself still has the picture */
    }
  }
  b.refs = urls;
}

/** Throw the unpublished new design away and keep the older, live one. */
export async function discardSite(businessId: string): Promise<string | null> {
  const { live, build } = await loadSite(businessId);
  if (live) return "This store already runs on the new design.";
  if (buildRunning(build)) return "Wait for the current work to finish, or stop it.";
  await prisma.$transaction([
    prisma.storeSiteVersion.deleteMany({ where: { businessId } }),
    prisma.storeDesign.update({ where: { businessId }, data: { site: null, siteWip: null, siteBuild: null } }),
  ]);
  return null;
}

/** One edit, start to finish (the Orchestrator's route). */
export async function editSiteNow(businessId: string, message: string, refs: AgentRef[]): Promise<{ reply: string; error?: string }> {
  try {
    await assertUnderUsageCap(businessId);
  } catch (e) {
    const error = e instanceof Error ? e.message : "The AI allowance is used up.";
    return { reply: error, error };
  }
  const b = await startBuild(businessId, "edit");
  if (!b) return { reply: "The store is being worked on right now.", error: "The store is being worked on right now. Try again in a few minutes." };
  await prisma.orbitDesignTurn.create({ data: { businessId, role: "user", content: message.slice(0, 4000) } });
  return runBuild(businessId, b, message, refs);
}

const HEX = /^#[0-9a-f]{3,8}$/i;
const FONT = /^[A-Za-z0-9 ]{2,40}$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The platform's own screens (checkout, order, account) dressed in the store's colours, type and links. */
export async function shellDoc(businessId: string, site: StoreSite): Promise<OrbitDesignDoc> {
  const m = manifest(site);
  const prev = await loadDoc(businessId);
  const base = defaultDoc(prev.storeName, prev.tagline);
  const t = { ...base.tokens };
  for (const k of ["bg", "surface", "text", "muted", "border", "accent", "accentText"] as const) {
    const v = m.theme[k];
    if (typeof v === "string" && HEX.test(v)) t[k] = v;
  }
  const fonts = [m.theme.headingFont, m.theme.bodyFont].map((f) => (typeof f === "string" && FONT.test(f) ? f : ""));
  if (fonts[0]) t.fontHeading = `"${fonts[0]}", serif`;
  if (fonts[1]) t.fontBody = `"${fonts[1]}", sans-serif`;
  t.googleFonts = [...new Set(fonts.filter(Boolean))];
  if (Number.isFinite(Number(m.theme.radius))) t.radius = Math.max(0, Math.min(32, Number(m.theme.radius)));
  const link = (slug: string, label: string) => `<a href="#page:${slug}" style="color:inherit;text-decoration:none">${esc(label)}</a>`;
  const nav = m.pages.filter((p) => p.nav && p.slug !== "home").slice(0, 5);
  const header = `<header style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 28px;padding:20px clamp(20px,5vw,64px);border-bottom:1px solid var(--od-border);background:var(--od-bg);color:var(--od-text)"><a href="#page:home" style="color:inherit;text-decoration:none;font-family:var(--od-font-heading);font-size:22px">${esc(prev.storeName)}</a><div style="display:flex;flex-wrap:wrap;gap:8px 22px;font-size:15px">${nav.map((p) => link(p.slug, p.title)).join("")}</div></header>`;
  const footer = `<footer style="padding:28px clamp(20px,5vw,64px);border-top:1px solid var(--od-border);color:var(--od-muted);font-size:14px">${esc(prev.storeName)}</footer>`;
  return {
    ...base,
    storeName: prev.storeName,
    tagline: m.tagline ?? prev.tagline,
    tokens: t,
    content: prev.content,
    components: { ...base.components, header, footer },
    pages: m.pages.map((p) => ({ slug: p.slug, title: p.title, nav: p.nav !== false, sections: [] })) as OrbitDesignDoc["pages"],
    direction: "store-agent",
  };
}

const IMG = /^(https:\/\/|\/uploads\/)[^\s"'<>`\\]{3,500}$/;
const LINK = /^(#page:[a-z0-9-]{1,41}|#product:[A-Za-z0-9_-]{1,60}|#cart|#account|https:\/\/[^\s"'<>]{3,280}|mailto:[^\s"'<>]{3,120}|tel:[0-9+ -]{5,20})$/;

/** The seller's own click edits: no AI, saved to the draft at once. Same target again replaces it. */
export async function saveEdits(businessId: string, raw: unknown): Promise<string | null> {
  const { draft, build } = await loadSite(businessId);
  if (!draft) return "There's no store yet.";
  if (buildRunning(build)) return "Wait for the current change to finish.";
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  let list = siteEdits(draft);
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, 20) as Record<string, unknown>[]) {
    const page = x.page === "*" || (typeof x.page === "string" && /^[a-z0-9-]{1,41}$/.test(x.page)) ? String(x.page) : "*";
    const from = str(x.from, 600);
    if (!from) continue;
    if (x.kind === "text") {
      const to = str(x.to, 600).trim();
      list = list.filter((e) => !(e.kind === "text" && e.from === from && (e.page === page || page === "*")));
      if (to && to !== from) list.push({ kind: "text", page, from, to });
    } else if (x.kind === "image") {
      const to = str(x.to, 520);
      if (!IMG.test(from) || !IMG.test(to)) return "That picture can't be used.";
      // the picture on screen may itself be a replacement: follow it back to the design's own
      const root = list.find((e) => e.kind === "image" && e.to === from)?.from ?? from;
      list = list.filter((e) => !(e.kind === "image" && e.from === root));
      if (root !== to) list.push({ kind: "image", from: root, to });
    } else if (x.kind === "link") {
      const to = str(x.to, 300).trim();
      if (!LINK.test(to)) return "Use a page, a product, or a full web address (https://…).";
      const text = str(x.text, 200);
      list = list.filter((e) => !(e.kind === "link" && e.from === from && e.text === text && (e.page === page || page === "*")));
      if (to !== from) list.push({ kind: "link", page, from, text, to });
    } else if (x.kind === "hide") {
      if (!list.some((e) => e.kind === "hide" && e.from === from && e.page === page)) list.push({ kind: "hide", page, from });
    } else if (x.kind === "unhide") list = list.filter((e) => !(e.kind === "hide" && e.from === from));
  }
  await keepVersion(businessId, draft, "Your edit");
  const next: StoreSite = { files: { ...draft.files, "edits.json": JSON.stringify(list.slice(-400)) } };
  await prisma.storeDesign.update({ where: { businessId }, data: { site: JSON.stringify(next) } });
  return null;
}

/** Menu, settings and lists the design declared. Only values change; the declarations stay the designer's. */
export async function saveCustomise(businessId: string, body: { menu?: unknown; settings?: unknown; lists?: unknown }): Promise<string | null> {
  const { draft, build } = await loadSite(businessId);
  if (!draft) return "There's no store yet.";
  if (buildRunning(build)) return "Wait for the current change to finish.";
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(draft.files["site.json"] ?? "{}") as Record<string, unknown>;
  } catch {
    json = {};
  }
  const m = manifest(draft);
  if (Array.isArray(body.menu)) {
    const menu = (body.menu as Record<string, unknown>[]).slice(0, 14).map((x) => ({ label: String(x?.label ?? "").trim().slice(0, 40), href: String(x?.href ?? "").trim().slice(0, 300) }));
    if (!menu.length || menu.some((x) => !x.label)) return "Every menu item needs a name, and the menu needs at least one.";
    if (menu.some((x) => !LINK.test(x.href))) return "A menu link must be a page, a product, or a full web address (https://…).";
    json.menu = menu;
  }
  if (body.settings && typeof body.settings === "object") {
    const v = body.settings as Record<string, unknown>;
    json.settings = m.settings.map((s) => {
      if (!(s.key in v)) return s;
      const x = v[s.key];
      if (s.type === "number") {
        const n = Number(x);
        return Number.isFinite(n) ? { ...s, value: Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n)) } : s;
      }
      if (s.type === "toggle") return { ...s, value: x === true };
      if (s.type === "select") return (s.options ?? []).map(String).includes(String(x)) ? { ...s, value: String(x) } : s;
      if (s.type === "color") return HEX.test(String(x)) ? { ...s, value: String(x) } : s;
      if (s.type === "image") return IMG.test(String(x)) ? { ...s, value: String(x) } : s;
      return { ...s, value: String(x ?? "").slice(0, 600) };
    });
  }
  if (body.lists && typeof body.lists === "object") {
    const v = body.lists as Record<string, unknown>;
    const lists = m.lists.map((l) => {
      const items = v[l.key];
      if (!Array.isArray(items)) return l;
      const min = Math.max(0, l.min ?? 0);
      const max = Math.min(60, l.max ?? 30);
      const clean = (items as Record<string, unknown>[]).slice(0, max).map((it) =>
        Object.fromEntries(
          l.fields.map((f) => {
            const x = String(it?.[f.key] ?? "").slice(0, f.type === "textarea" ? 3000 : 600);
            return [f.key, f.type === "image" ? (IMG.test(x) ? x : "") : f.type === "link" ? (LINK.test(x) ? x : "") : x];
          }),
        ),
      );
      return clean.length < min ? l : { ...l, items: clean };
    });
    json.lists = lists;
  }
  await keepVersion(businessId, draft, "Your settings");
  const next: StoreSite = { files: { ...draft.files, "site.json": JSON.stringify(json) } };
  await prisma.storeDesign.update({ where: { businessId }, data: { site: JSON.stringify(next) } });
  return null;
}

export async function undoSite(businessId: string): Promise<{ left: number } | null> {
  const v = await prisma.storeSiteVersion.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" } });
  const site = parseSite(v?.site);
  if (!v || !site) return null;
  await prisma.storeDesign.update({ where: { businessId }, data: { site: v.site } });
  await prisma.storeSiteVersion.delete({ where: { id: v.id } });
  return { left: await prisma.storeSiteVersion.count({ where: { businessId } }) };
}

export async function publishSite(businessId: string): Promise<{ published: boolean; note: string }> {
  const { draft, build } = await loadSite(businessId);
  if (!draft?.files["pages/home.html"]) return { published: false, note: "There's no store yet. Build it first, then publish." };
  if (buildRunning(build)) return { published: false, note: "The store is still being worked on. Publish when it finishes." };
  const doc = JSON.stringify(await shellDoc(businessId, draft));
  await prisma.storeDesign.update({ where: { businessId }, data: { siteLive: JSON.stringify(draft), doc, wired: doc, wiredAt: new Date(), published: true } });
  return { published: true, note: "" };
}
