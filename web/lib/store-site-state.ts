import { prisma } from "@/lib/prisma";
import { buildRunning, manifest, siteEdits, SYSTEM_PAGES, type MenuItem, type SiteBuild, type SiteEdit, type SiteList, type SiteSetting, type SitePage, type SiteProduct } from "@/lib/store-site";
import { loadSite, siteData } from "@/lib/store-site-data";

export interface SiteState {
  has: boolean;
  running: boolean;
  build: SiteBuild | null;
  pages: SitePage[];
  shopPages: SitePage[];
  menu: MenuItem[];
  settings: SiteSetting[];
  lists: SiteList[];
  hidden: Extract<SiteEdit, { kind: "hide" }>[];
  published: boolean;
  dirty: boolean;
  undo: number;
  /** changes whenever the draft does — reloads the preview */
  rev: string;
  turns: { role: "user" | "assistant"; content: string }[];
  products: SiteProduct[];
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export async function siteState(businessId: string): Promise<SiteState> {
  const [{ draft, build, published, dirty }, undo, turns, data] = await Promise.all([
    loadSite(businessId),
    prisma.storeSiteVersion.count({ where: { businessId } }),
    prisma.orbitDesignTurn.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 40 }),
    siteData(businessId),
  ]);
  const m = draft ? manifest(draft) : null;
  return {
    has: !!draft?.files["pages/home.html"],
    running: buildRunning(build),
    build,
    pages: m?.pages ?? [],
    shopPages: SYSTEM_PAGES,
    menu: m?.menu ?? [],
    settings: m?.settings ?? [],
    lists: m?.lists ?? [],
    hidden: draft ? siteEdits(draft).filter((e): e is Extract<SiteEdit, { kind: "hide" }> => e.kind === "hide") : [],
    published,
    dirty,
    undo,
    rev: draft ? hash(JSON.stringify(draft)) : "0",
    turns: turns.reverse().map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
    products: data?.products ?? [],
  };
}
