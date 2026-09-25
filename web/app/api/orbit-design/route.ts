import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { loadDoc, saveDoc } from "@/lib/orbit-design-generate";
import { clamp, defaultDoc, defaultNavShow, inferPageType, normalizeDoc, type DesignContent, type DesignTokens, type OrbitDesignDoc } from "@/lib/orbit-design";
import { SECTION_KINDS } from "@/lib/orbit-sections";

/** Current design + publish state, for the studio to hydrate from. */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const [doc, design] = await Promise.all([
    loadDoc(businessId),
    prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true } }),
  ]);
  return NextResponse.json({ doc, published: design?.published ?? false });
}

/**
 * Direct edits that don't need the model: the adjustment knobs (token tweaks), plus section
 * visibility / reordering and page reordering. Kept LLM-free so retuning is instant and free.
 */
export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json()) as {
    tokens?: Partial<DesignTokens>;
    content?: Partial<DesignContent>;
    storeName?: string;
    tagline?: string;
    blockHtml?: { block: string; html: string }; // "header" | "footer" | "s:<sectionId>"
    blockDelete?: string; // "s:<sectionId>"
    blockEdit?: { section: string; variant?: string; props?: Record<string, unknown> }; // curated-component section: swap variant / merge props
    tweak?: { key: string; value: string }; // set a tweak control's value
    tweakRemove?: string; // remove a tweak control by key
    sectionVisibility?: { page: string; id: string; visible: boolean }[];
    sectionOrder?: { page: string; ids: string[] };
    pageOrder?: string[];
    pageNav?: { slug: string; navShow: "always" | "afterLogin" | "never"; title?: string };
    pageNavAuto?: string; // slug — clear the seller lock, let the system decide nav visibility again
    pageAdd?: { title: string };
    pageDelete?: string; // slug — custom pages only
  };

  const doc: OrbitDesignDoc = await loadDoc(businessId);

  if (body.content) {
    const c = body.content;
    if (c.announcement) doc.content.announcement = { enabled: c.announcement.enabled !== false, text: String(c.announcement.text ?? "").slice(0, 200) };
    if (typeof c.logoUrl === "string") doc.content.logoUrl = c.logoUrl.trim().slice(0, 500);
    if (typeof c.contactEmail === "string") doc.content.contactEmail = c.contactEmail.slice(0, 160);
    if (typeof c.contactPhone === "string") doc.content.contactPhone = c.contactPhone.slice(0, 60);
    if (typeof c.contactAddress === "string") doc.content.contactAddress = c.contactAddress.slice(0, 300);
    if (c.socials) doc.content.socials = { ...doc.content.socials, ...c.socials };
  }

  if (body.tokens) {
    doc.tokens = { ...doc.tokens, ...clean(body.tokens) };
    doc.tokens.radius = clamp(Number(doc.tokens.radius), 0, 32);
    doc.tokens.density = clamp(Number(doc.tokens.density), 0.7, 1.6);
    doc.tokens.headingWeight = clamp(Number(doc.tokens.headingWeight), 400, 900);
  }
  if (typeof body.storeName === "string" && body.storeName.trim()) doc.storeName = body.storeName.trim().slice(0, 80);
  if (typeof body.tagline === "string") doc.tagline = body.tagline.trim().slice(0, 160);

  if (body.tweak && typeof body.tweak.key === "string") {
    const t = (doc.tweaks ?? []).find((x) => x.key === body.tweak!.key);
    if (t) t.value = String(body.tweak.value ?? "").slice(0, 80);
  }
  if (typeof body.tweakRemove === "string") {
    doc.tweaks = (doc.tweaks ?? []).filter((x) => x.key !== body.tweakRemove);
  }

  if (body.blockHtml && typeof body.blockHtml.html === "string") {
    const { block, html } = body.blockHtml;
    const clean = html.slice(0, 20000);
    if (block === "header") doc.components.header = clean;
    else if (block === "footer") doc.components.footer = clean;
    else if (block.startsWith("s:")) {
      const id = block.slice(2);
      for (const p of doc.pages) {
        const s = p.sections.find((x) => x.id === id);
        if (s) s.html = clean;
      }
    }
  }
  if (body.blockDelete && body.blockDelete.startsWith("s:")) {
    const id = body.blockDelete.slice(2);
    for (const p of doc.pages) p.sections = p.sections.filter((x) => x.id !== id);
  }

  if (body.blockEdit?.section) {
    const id = body.blockEdit.section.replace(/^s:/, "");
    const s = doc.pages.flatMap((p) => p.sections).find((x) => x.id === id);
    if (s?.block) {
      if (typeof body.blockEdit.variant === "string" && SECTION_KINDS[s.block.kind]?.includes(body.blockEdit.variant)) {
        s.block.variant = body.blockEdit.variant;
      }
      if (body.blockEdit.props && typeof body.blockEdit.props === "object") {
        s.block.props = { ...s.block.props, ...body.blockEdit.props };
      }
    }
  }

  if (body.sectionVisibility) {
    for (const v of body.sectionVisibility) {
      const s = doc.pages.find((p) => p.slug === v.page)?.sections.find((x) => x.id === v.id);
      if (s) s.visible = v.visible !== false;
    }
  }
  if (body.sectionOrder) {
    const page = doc.pages.find((p) => p.slug === body.sectionOrder!.page);
    if (page) {
      const rank = new Map(body.sectionOrder.ids.map((id, i) => [id, i]));
      page.sections.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    }
  }
  if (body.pageOrder) {
    const rank = new Map(body.pageOrder.map((s, i) => [s, i]));
    doc.pages.sort((a, b) => (a.slug === "home" ? -1 : b.slug === "home" ? 1 : (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99)));
  }

  if (body.pageNav?.slug && ["always", "afterLogin", "never"].includes(body.pageNav.navShow)) {
    const p = doc.pages.find((x) => x.slug === body.pageNav!.slug);
    if (p) {
      p.navShow = body.pageNav.navShow;
      p.nav = body.pageNav.navShow !== "never";
      p.navLocked = true;
      if (typeof body.pageNav.title === "string" && body.pageNav.title.trim()) p.title = body.pageNav.title.trim().slice(0, 60);
    }
  }

  if (body.pageNavAuto) {
    const p = doc.pages.find((x) => x.slug === body.pageNavAuto);
    if (p) {
      p.navLocked = false;
      const ns = defaultNavShow(p.pageType ?? inferPageType(p.slug));
      p.navShow = ns;
      p.nav = ns !== "never";
    }
  }

  if (body.pageAdd?.title?.trim()) {
    const title = body.pageAdd.title.trim().slice(0, 60);
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    const taken = new Set(doc.pages.map((p) => p.slug));
    while (taken.has(slug)) slug = `${slug}-2`;
    doc.pages.push({
      slug,
      title,
      nav: true,
      navShow: "always",
      navLocked: true,
      pageType: "custom",
      sections: [
        {
          id: `${slug}-intro`,
          type: "rich-text",
          label: title,
          visible: true,
          html: `<section style="max-width:var(--od-maxw,1120px);margin:0 auto;padding:120px 24px;text-align:center"><h1 style="font-family:var(--od-font-heading);font-size:clamp(2rem,5vw,3.5rem);color:var(--od-text)">${title}</h1><p style="color:var(--od-muted);margin-top:16px;font-size:1.05rem">Describe this page in the chat and Orbit will build it — or add sections here.</p></section>`,
        },
      ],
    });
  }

  if (body.pageDelete) {
    const p = doc.pages.find((x) => x.slug === body.pageDelete);
    if (p && (p.pageType === "custom" || !["home", "store", "about", "contact", "cart", "checkout", "product", "account", "login"].includes(p.slug))) {
      doc.pages = doc.pages.filter((x) => x.slug !== body.pageDelete);
    }
  }

  const next = normalizeDoc(doc, doc.storeName, doc.tagline);
  await saveDoc(businessId, next);

  // The live storefront serves `wired ?? doc`. Once handed off, push these LLM-free edits (brand,
  // tokens, header/footer, content-only sections + pages) into `wired` too so they go live now.
  // Sections that carry interactive slots still need a Re-wire (they need the wiring pass).
  try {
    const row = await prisma.storeDesign.findUnique({ where: { businessId }, select: { wired: true, backendWiredAt: true } });
    if (row?.backendWiredAt && row.wired) {
      const w = JSON.parse(row.wired) as OrbitDesignDoc;
      w.storeName = next.storeName;
      w.tagline = next.tagline;
      w.tokens = next.tokens;
      w.content = next.content;
      w.components = next.components;
      w.tweaks = next.tweaks;
      const hasSlot = (p: { sections: { html?: string }[] }) =>
        p.sections.some((s) => /data-od-slot=|\{\{\s*(checkout|cart|account|auth|product)\s*\}\}/i.test(s.html || ""));
      const bySlug = new Map(w.pages.map((p, i) => [p.slug, i]));
      for (const p of next.pages) {
        if (hasSlot(p)) continue;
        const i = bySlug.get(p.slug);
        if (i == null) w.pages.push(JSON.parse(JSON.stringify(p)));
        else w.pages[i] = { ...w.pages[i], ...JSON.parse(JSON.stringify(p)) };
      }
      const live = new Set(next.pages.map((p) => p.slug));
      w.pages = w.pages.filter((p) => live.has(p.slug));
      await prisma.storeDesign.update({ where: { businessId }, data: { wired: JSON.stringify(w) } });
    }
  } catch {
    /* best effort — the seller can Re-wire */
  }

  return NextResponse.json({ doc: next });
}

/** Wipe the design back to a blank default and clear the chat history — the studio "Clean" button. */
export async function DELETE() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true } });
  const fresh = defaultDoc(business?.name ?? "Your Store", business?.niche ?? "great products");

  // Clean = a full reset of a not-yet-real store: wipe the design, the "Orbit Code" backend spec,
  // and every shopper account / submitted record / OTP that belonged to it.
  await prisma.$transaction([
    prisma.orbitDesignTurn.deleteMany({ where: { businessId } }),
    prisma.storeRecord.deleteMany({ where: { businessId } }),
    prisma.customerOtp.deleteMany({ where: { businessId } }),
    prisma.storeCustomer.deleteMany({ where: { businessId } }),
    prisma.storeDesign.upsert({
      where: { businessId },
      create: { businessId, doc: JSON.stringify(fresh), published: false },
      update: { doc: JSON.stringify(fresh), wired: null, wiredAt: null, backend: null, backendWiredAt: null, published: false },
    }),
  ]);

  return NextResponse.json({ doc: fresh, published: false });
}

function clean(t: Partial<DesignTokens>): Partial<DesignTokens> {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<DesignTokens>;
}
