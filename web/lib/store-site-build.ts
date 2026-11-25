/** Running the store agent for a seller: one job at a time, saved as it goes, with undo and publish. */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runStoreAgent, STORE_AGENT_MODEL, type AgentRef, type StoreAgentResult } from "@/lib/store-agent";
import { loadDoc } from "@/lib/orbit-design-generate";
import { defaultDoc, type OrbitDesignDoc } from "@/lib/orbit-design";
import { buildRunning, lintSite, manifest, parseBuild, parseSite, type SiteBuild, type StoreSite } from "@/lib/store-site";
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

export async function runBuild(businessId: string, b: SiteBuild, brief: string, references: AgentRef[]): Promise<{ reply: string; error?: string }> {
  const edit = b.kind === "edit";
  const before = (await loadSite(businessId)).draft;
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
    const result = await runStoreAgent({
      brief,
      data,
      site: edit ? (before ?? undefined) : undefined,
      edit,
      references,
      budgetUsd: edit ? EDIT_BUDGET() : BUILD_BUDGET(),
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
        if (!edit && !before && owns()) await prisma.storeDesign.update({ where: { businessId }, data: { site: JSON.stringify(site) } });
      },
      shouldStop: () => stop,
    });

    const usable = !!result.site.files["pages/home.html"];
    const hardFaults = lintSite(result.site, data.products.map((p) => p.id)).filter((x) => /cut off|missing/.test(x) && !/site\.json/.test(x));
    const changed = JSON.stringify(result.site) !== JSON.stringify(before ?? { files: {} });
    const keep = usable && changed && owns() && !(edit && (hardFaults.length > 0 || result.stopped === "stopped"));
    if (keep) {
      if (before) await keepVersion(businessId, before, edit ? brief : "Before the new build");
      await prisma.storeDesign.update({ where: { businessId }, data: { site: JSON.stringify(result.site), doc: JSON.stringify(await shellDoc(businessId, result.site)) } });
    }
    const left = result.issues.length ? ` ${result.issues.length} small thing${result.issues.length === 1 ? "" : "s"} still need attention: ${result.issues.slice(0, 3).join("; ")}.` : "";
    if (result.stopped === "stopped") {
      await finish("stopped", keep ? "Stopped. What was built so far is in the preview." : "Stopped. Nothing was changed.", result);
      return { reply: "Stopped." };
    }
    if (!usable || (edit && !changed) || (edit && hardFaults.length)) {
      const reply = result.summary && edit && !changed ? result.summary : "That didn't work out, and nothing was changed. Please try again or word it differently.";
      await finish("failed", reply, result);
      return { reply, error: reply };
    }
    const cut = result.stopped === "budget" || result.stopped === "turns" || result.stopped === "max_tokens" ? " I reached the working limit, so check the pages and tell me what to finish." : "";
    const reply = (result.summary || (edit ? "Done. The change is in the preview." : "Your store is ready in the preview.")) + cut + left;
    await finish("done", reply, result);
    return { reply };
  } catch (e) {
    console.error("[store-agent]", e);
    const reply = "The build stopped because of a technical problem. Your last version is safe; please try again.";
    await finish("failed", reply).catch(() => {});
    return { reply, error: reply };
  } finally {
    clearInterval(timer);
  }
}

/** One edit, start to finish (the Orchestrator's route). */
export async function editSiteNow(businessId: string, message: string, refs: AgentRef[]): Promise<{ reply: string; error?: string }> {
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

export async function undoSite(businessId: string): Promise<{ left: number } | null> {
  const v = await prisma.storeSiteVersion.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" } });
  const site = parseSite(v?.site);
  if (!v || !site) return null;
  await prisma.storeDesign.update({ where: { businessId }, data: { site: v.site, doc: JSON.stringify(await shellDoc(businessId, site)) } });
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
