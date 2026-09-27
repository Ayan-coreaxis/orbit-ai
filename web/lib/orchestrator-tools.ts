import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { parseOptionTypes } from "@/lib/variants";
import { listProducts } from "@/lib/product-ops";
import { mediaRefIds } from "@/lib/media";

/**
 * Look-up tools for the Orchestrator. Instead of pasting the whole catalogue, media library,
 * order book and chat history into every prompt, the prompt carries a short summary and the
 * model fetches exactly the rows it needs. Small, exact context → fewer mixed-up products and
 * invented numbers, and a 1,000-product store works the same as a 10-product one.
 *
 * Refs stay the same everywhere: P<n> = n-th product by creation date (lib/product-ops
 * `listProducts`), M<n> = n-th media file by upload date (lib/media `mediaRefIds`).
 */

/** Up to this many products are simply listed in the prompt — a look-up round-trip isn't worth it. */
export const INLINE_PRODUCTS = 15;
const INLINE_MEDIA = 8;
export const MAX_LOOKUPS = 6;

type FullProduct = Awaited<ReturnType<typeof listProducts>>[number];

function productRow(p: FullProduct, ref: string, currency: string): string {
  const cost = p.costPrice != null ? `, cost ${money(p.costPrice, currency)}` : ", cost not set";
  const axes = parseOptionTypes(p.optionTypes);
  const stock = p.variants.length
    ? `, options ${axes.map((a) => `${a.name}: ${a.values.join("/")}`).join("; ")} — variants: ${p.variants
        .slice(0, 12)
        .map((v) => `${v.label} ${v.price != null ? money(v.price, currency) : "base price"} stock ${v.stock}`)
        .join(", ")}${p.variants.length > 12 ? ", …" : ""}`
    : `, stock ${p.stock}`;
  return `${ref} ${p.name} — price ${money(p.price, currency)}${cost}${stock}${p.imageUrl ? "" : ", NO PHOTO"}${p._count.bundleItems ? ", part of a bundle" : ""}`;
}

const totalStock = (p: { stock: number; variants: { stock: number }[] }) => (p.variants.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock);

/** PRODUCTS section of the prompt: counts always, the rows themselves only for a small catalogue. */
export async function catalogSummary(businessId: string, currency: string): Promise<string> {
  const products = await listProducts(businessId);
  const head =
    "PRODUCTS (you CAN propose: edits with product_changes — price, cost_price, stock, name, description, photos from the MEDIA LIBRARY, size/colour/flavour variants; new products with new_products; deletions with delete_products. The owner presses Apply for each proposal.)";
  if (!products.length) return `\n${head}\nnone yet`;
  if (products.length <= INLINE_PRODUCTS) return `\n${head}\n${products.map((p, i) => productRow(p, `P${i + 1}`, currency)).join("\n")}`;

  const out = products.filter((p) => totalStock(p) <= 0).length;
  const low = products.filter((p) => totalStock(p) > 0 && totalStock(p) <= 5).length;
  const noPhoto = products.filter((p) => !p.imageUrl).length;
  const noCost = products.filter((p) => p.costPrice == null).length;
  return `
${head}
${products.length} products (refs P1–P${products.length}): ${out} sold out, ${low} low on stock (≤5), ${noPhoto} without a photo, ${noCost} without a cost price.
They are NOT listed here. Before you quote, compare or change any specific product, look it up with find_products and use the exact ref it returns — never guess a price, stock figure or ref.`;
}

/** MEDIA section: counts + the newest few (what the owner most likely means by "the photo I sent"). */
export async function mediaSummary(businessId: string): Promise<string> {
  const ids = await mediaRefIds(businessId);
  if (!ids.length)
    return "\nMEDIA LIBRARY: empty. If you or a specialist need photos, videos, voice notes or documents from the owner, ask them to attach it with the 📎 button in this chat.";
  const newest = await prisma.mediaAsset.findMany({ where: { businessId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: INLINE_MEDIA });
  const byKind = await prisma.mediaAsset.groupBy({ by: ["kind"], where: { businessId }, _count: true });
  const refOf = (id: string) => `M${ids.indexOf(id) + 1}`;
  return `
MEDIA LIBRARY (files the owner gave you): ${ids.length} files — ${byKind.map((k) => `${k._count} ${k.kind}`).join(", ")}. A product photo can be set with product_changes image: "M3" (main image) or add_to_gallery: "M3" — only images. If you need more files, ask the owner to attach them with the 📎 button.
Newest:
${newest.map((m) => mediaLine(m, refOf(m.id))).join("\n")}${ids.length > INLINE_MEDIA ? "\nOlder files: use find_media." : ""}`;
}

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

function mediaLine(m: { kind: string; name: string; source: string; createdAt: Date; text: string | null; frames: string | null }, ref: string) {
  let frames = 0;
  try {
    frames = m.frames ? (JSON.parse(m.frames) as unknown[]).length : 0;
  } catch {
    frames = 0;
  }
  const extra =
    m.kind === "audio" ? (m.text ? ` — transcript: "${m.text.slice(0, 160)}${m.text.length > 160 ? "…" : ""}"` : " — no transcript") : m.kind === "video" ? ` — ${frames} still frames` : "";
  return `${ref} ${m.kind} "${m.name}" (${m.source}, ${ago(m.createdAt)})${extra}`;
}

// ---------------------------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------------------------

export const FIND_PRODUCTS_TOOL: Anthropic.Messages.Tool = {
  name: "find_products",
  description:
    "Look up products in the owner's store: exact price, cost, stock, variants, photo status and the ref (P…) to use in product_changes / delete_products / create_content / meta_ads. Search by words in the name, or list by a filter. Use it before quoting or changing any product that isn't listed in your prompt.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words from the product name, e.g. 'salt pepper chips'. Leave empty to list by filter." },
      filter: { type: "string", enum: ["all", "sold_out", "low_stock", "no_photo", "no_cost"], description: "Default: all" },
      limit: { type: "number", description: "Max rows, 1–25 (default 10)" },
    },
  },
};

export const FIND_ORDERS_TOOL: Anthropic.Messages.Tool = {
  name: "find_orders",
  description:
    "Look up the store's real orders: who ordered what, city, total, status and payment. Filter by status, customer name / phone, or the last N days. Use it for questions about specific orders, customers or recent sales — never guess them.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["any", "pending", "confirmed", "shipped", "fulfilled", "cancelled"] },
      customer: { type: "string", description: "Part of the customer's name or phone number" },
      days: { type: "number", description: "Only orders from the last N days" },
      limit: { type: "number", description: "Max rows, 1–20 (default 10)" },
    },
  },
};

export const FIND_MEDIA_TOOL: Anthropic.Messages.Tool = {
  name: "find_media",
  description: "Look up files in the media library (photos, videos, voice notes, PDFs) by words in the file name and/or kind. Returns refs (M…) you can use as product photos or open with open_media.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words from the file name" },
      kind: { type: "string", enum: ["image", "video", "audio", "pdf"] },
      limit: { type: "number", description: "Max rows, 1–25 (default 10)" },
    },
  },
};

export const SEARCH_HISTORY_TOOL: Anthropic.Messages.Tool = {
  name: "search_chat_history",
  description:
    "Search OLDER messages of this chat (before the recent ones you can already see) for something the owner said earlier — a decision, a number they gave you, a preference. Use it when the owner refers to an earlier conversation you can't see.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Words to look for, e.g. 'eid discount' or 'supplier price'" } },
    required: ["query"],
  },
};

const words = (q: unknown) =>
  String(q ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .slice(0, 8);

/** "chips" should find "Corn Chip", "straberry" should find "Strawberry": match on the first 4 letters too. */
function score(text: string, ws: string[]): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of ws) {
    if (t.includes(w)) s += 2;
    else if (w.length >= 5 && t.includes(w.slice(0, 4))) s += 1;
  }
  return s;
}

const clampLimit = (v: unknown, max: number, dflt = 10) => Math.min(max, Math.max(1, Math.floor(Number(v) || dflt)));

async function findProducts(businessId: string, input: Record<string, unknown>, currency: string): Promise<string> {
  const products = await listProducts(businessId);
  if (!products.length) return "The store has no products yet.";
  const ws = words(input.query);
  const filter = typeof input.filter === "string" ? input.filter : "all";
  const limit = clampLimit(input.limit, 25);

  let rows = products.map((p, i) => ({ p, ref: `P${i + 1}` }));
  if (filter === "sold_out") rows = rows.filter(({ p }) => totalStock(p) <= 0);
  else if (filter === "low_stock") rows = rows.filter(({ p }) => totalStock(p) > 0 && totalStock(p) <= 5);
  else if (filter === "no_photo") rows = rows.filter(({ p }) => !p.imageUrl);
  else if (filter === "no_cost") rows = rows.filter(({ p }) => p.costPrice == null);

  if (ws.length) {
    rows = rows
      .map((r) => ({ ...r, s: score(`${r.p.name} ${r.p.variants.map((v) => v.label).join(" ")}`, ws) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
  }
  if (!rows.length) return ws.length ? `No product matches "${String(input.query)}". The store has ${products.length} products — try other words or a filter.` : "No products match that filter.";
  const shown = rows.slice(0, limit);
  return `${rows.length} match${rows.length === 1 ? "" : "es"}${rows.length > shown.length ? ` (showing ${shown.length})` : ""}:\n${shown.map(({ p, ref }) => productRow(p, ref, currency)).join("\n")}`;
}

async function findOrders(businessId: string, input: Record<string, unknown>, currency: string): Promise<string> {
  const limit = clampLimit(input.limit, 20);
  const status = typeof input.status === "string" && input.status !== "any" ? input.status : undefined;
  const who = typeof input.customer === "string" ? input.customer.trim().slice(0, 60) : "";
  const days = Number(input.days);
  const where = {
    businessId,
    ...(status && { status }),
    ...(who && { OR: [{ customerName: { contains: who, mode: "insensitive" as const } }, { customerPhone: { contains: who.replace(/\s/g, "") } }] }),
    ...(days > 0 && { createdAt: { gte: new Date(Date.now() - Math.min(days, 730) * 86400000) } }),
  };
  const [count, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
  ]);
  if (!count) return "No orders match.";
  const lines = orders.map((o) => {
    let items = "";
    try {
      items = (JSON.parse(o.items) as { name?: string; variantLabel?: string | null; qty?: number }[])
        .map((i) => `${i.qty ?? 1}× ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}`)
        .join(", ");
    } catch {
      items = "?";
    }
    let city = "";
    try {
      city = o.shippingAddress ? ((JSON.parse(o.shippingAddress) as { city?: string }).city ?? "") : "";
    } catch {
      city = "";
    }
    const pay = o.paymentProvider === "cod" ? `COD ${o.paymentStatus === "paid" ? "cash collected" : "not collected yet"}` : `card ${o.paymentStatus}`;
    return `#${o.id.slice(-6).toUpperCase()} · ${o.createdAt.toISOString().slice(0, 10)} · ${o.customerName} (${o.customerPhone})${city ? ` · ${city}` : ""} · ${items} · ${money(o.total, currency)} · ${o.status}${o.verified ? "" : " (awaiting customer confirmation)"} · ${pay}${o.flagged ? ` · FLAGGED: ${o.flagReason ?? ""}` : ""}${o.couponCode ? ` · code ${o.couponCode}` : ""}`;
  });
  return `${count} order${count === 1 ? "" : "s"} match${count > orders.length ? ` (newest ${orders.length} shown)` : ""}:\n${lines.join("\n")}`;
}

async function findMedia(businessId: string, input: Record<string, unknown>): Promise<string> {
  const ids = await mediaRefIds(businessId);
  if (!ids.length) return "The media library is empty.";
  const kind = typeof input.kind === "string" ? input.kind : undefined;
  const ws = words(input.query);
  const rows = await prisma.mediaAsset.findMany({ where: { businessId, ...(kind && { kind }) }, orderBy: { createdAt: "desc" }, take: 500 });
  const hits = (ws.length ? rows.map((m) => ({ m, s: score(m.name, ws) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).map((r) => r.m) : rows).slice(
    0,
    clampLimit(input.limit, 25),
  );
  if (!hits.length) return "No file matches.";
  return hits.map((m) => mediaLine(m, `M${ids.indexOf(m.id) + 1}`)).join("\n");
}

async function searchHistory(businessId: string, input: Record<string, unknown>, before: Date | null): Promise<string> {
  const ws = words(input.query);
  if (!ws.length) return "Give a few words to search for.";
  const rows = await prisma.orchestratorMessage.findMany({
    where: {
      businessId,
      ...(before && { createdAt: { lt: before } }),
      OR: ws.map((w) => ({ content: { contains: w, mode: "insensitive" as const } })),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { role: true, speaker: true, content: true, createdAt: true },
  });
  const best = rows
    .map((r) => ({ r, s: score(r.content, ws) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .sort((a, b) => a.r.createdAt.getTime() - b.r.createdAt.getTime());
  if (!best.length) return "Nothing about that in the older messages.";
  return best
    .map(({ r }) => `[${r.createdAt.toISOString().slice(0, 10)}] ${r.role === "user" ? "Owner" : r.speaker && r.speaker !== "orchestrator" ? r.speaker : "You"}: ${r.content.slice(0, 400)}${r.content.length > 400 ? "…" : ""}`)
    .join("\n");
}

export const LOOKUP_TOOL_NAMES = new Set([FIND_PRODUCTS_TOOL.name, FIND_ORDERS_TOOL.name, FIND_MEDIA_TOOL.name, SEARCH_HISTORY_TOOL.name]);

/** Which look-up tools make sense for this store right now (no point offering an empty order book). */
export async function lookupTools(businessId: string, oldestInHistory: Date | null): Promise<Anthropic.Messages.Tool[]> {
  const [products, orders, media, older] = await Promise.all([
    prisma.product.count({ where: { businessId } }),
    prisma.order.count({ where: { businessId } }),
    prisma.mediaAsset.count({ where: { businessId } }),
    oldestInHistory ? prisma.orchestratorMessage.count({ where: { businessId, createdAt: { lt: oldestInHistory } } }) : Promise.resolve(0),
  ]);
  return [
    ...(products > INLINE_PRODUCTS ? [FIND_PRODUCTS_TOOL] : []),
    ...(orders ? [FIND_ORDERS_TOOL] : []),
    ...(media > INLINE_MEDIA ? [FIND_MEDIA_TOOL] : []),
    ...(older ? [SEARCH_HISTORY_TOOL] : []),
  ];
}

/** Run one look-up tool call. */
export async function runLookup(
  businessId: string,
  name: string,
  input: Record<string, unknown>,
  ctx: { currency: string; oldestInHistory: Date | null },
): Promise<string> {
  try {
    if (name === FIND_PRODUCTS_TOOL.name) return await findProducts(businessId, input, ctx.currency);
    if (name === FIND_ORDERS_TOOL.name) return await findOrders(businessId, input, ctx.currency);
    if (name === FIND_MEDIA_TOOL.name) return await findMedia(businessId, input);
    if (name === SEARCH_HISTORY_TOOL.name) return await searchHistory(businessId, input, ctx.oldestInHistory);
  } catch (e) {
    return `Look-up failed: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`;
  }
  return "Unknown tool.";
}

/**
 * Products the specialists see for one message: the whole (small) catalogue, or the rows matching
 * the message's words plus the catalogue counts. Specialists have no look-up tools, so they get the
 * exact rows up front — otherwise they guess ("stock is low") about products they can't see.
 */
export async function productsForMessage(businessId: string, text: string, currency: string): Promise<string> {
  const count = await prisma.product.count({ where: { businessId } });
  const summary = await catalogSummary(businessId, currency);
  if (count <= INLINE_PRODUCTS) return summary;
  const hits = await findProducts(businessId, { query: text, limit: 6 }, currency);
  return `${summary}\nProducts matching this message:\n${hits}`;
}
