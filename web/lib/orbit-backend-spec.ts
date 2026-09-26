/**
 * "The backend is data." Orbit Code (the Handoff agent) reads the pages Orbit Design drew and
 * emits a StoreBackendSpec: which designed page is a checkout / sign-in / account / tracking
 * widget, which interactive slots are data-collection forms, and the fields of each collection.
 *
 * The generic storefront runtime + the generic /api/store/[businessId]/* routes execute ANY spec.
 * The DB shape never changes — customer data lives in the fixed `StoreRecord` bucket keyed by
 * `collection`. `normalizeSpec()` is the security gate: whatever the LLM returns, it is clamped
 * to the enums / allowlists / caps here before it is stored or executed. Designed page text is
 * DATA, never instructions — nothing in a spec is ever a path, a query, or code.
 */

export type WidgetKind = "checkout" | "auth" | "account" | "track" | "bundles" | "rewards";
export type FieldType = "text" | "textarea" | "stars" | "email" | "tel" | "select";
export type FormTarget = "order" | "newsletter" | "contact" | "support";

export interface SpecField {
  k: string; // slug key, unique within its collection/form
  t: FieldType;
  label: string;
  required?: boolean;
  options?: string[]; // for t:"select"
}

export interface SpecCollection {
  name: string; // slug, e.g. "reviews" | "wishlist" | "rsvps"
  label: string; // human, e.g. "Customer reviews"
  onProduct?: boolean; // rows belong to a product (reviews) — the widget reads productId
  moderated?: boolean; // new rows land as status:"pending" until the seller approves
  mineOnly?: boolean; // list endpoint only returns the signed-in customer's own rows
  fields: SpecField[];
}

export interface SpecForm {
  slot: string; // the data-od-slot name this form fills
  page: string; // page slug the slot lives on
  target: FormTarget | `collection:${string}`;
  fields: SpecField[];
  submitLabel?: string;
  successText?: string;
}

export interface StoreBackendSpec {
  version: 1;
  auth: { mode: "otp" | "password" | "none" | "both" };
  /** designed page slug -> the working widget that page hosts */
  pageWidgets: Record<string, WidgetKind>;
  collections: SpecCollection[];
  forms: SpecForm[];
  /** tabs the account widget shows, in order */
  accountTabs: Array<"profile" | "orders" | "track" | `collection:${string}`>;
  /** Which functional widgets the seller's OWN designed markup covers completely (real
   *  data-od-field-tagged inputs, the right data-od-form) — set by Orbit Code only after checking the
   *  actual design against the required fields for that kind, never guessed. A kind absent here falls
   *  back to the platform's own built-in widget for that page (the safe default for any store that
   *  hasn't designed its own version of it). */
  freeformWidgets?: WidgetKind[];
}

// --------------------------------------------------------------------------
// validation gate
// --------------------------------------------------------------------------

const WIDGET_KINDS: WidgetKind[] = ["checkout", "auth", "account", "track", "bundles", "rewards"];
const FIELD_TYPES: FieldType[] = ["text", "textarea", "stars", "email", "tel", "select"];
const FORM_TARGETS: FormTarget[] = ["order", "newsletter", "contact", "support"];

/** Collection / field / slug names the seller's design must never be able to claim. */
const RESERVED = new Set([
  "orders", "order", "customers", "customer", "auth", "session", "sessions", "business", "businesses",
  "users", "user", "admin", "payment", "payments", "otp", "otps", "records", "storedesign", "design",
  "products", "product", "carts", "cart", "config", "settings", "system", "internal",
]);

export function slugify(s: string, max = 32): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

function normField(raw: unknown, seen: Set<string>): SpecField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let k = slugify(String(r.k ?? r.key ?? r.name ?? r.label ?? ""), 24);
  if (!k) return null;
  while (seen.has(k)) k = `${k}-2`.slice(0, 24);
  seen.add(k);
  const t = FIELD_TYPES.includes(r.t as FieldType) ? (r.t as FieldType) : "text";
  const label = String(r.label ?? r.k ?? k).replace(/\s+/g, " ").trim().slice(0, 80) || k;
  const field: SpecField = { k, t, label };
  if (r.required === true) field.required = true;
  if (t === "select" && Array.isArray(r.options)) {
    const opts = r.options.map((o) => String(o).slice(0, 60)).filter(Boolean).slice(0, 20);
    if (opts.length) field.options = opts;
  }
  return field;
}

function normFields(raw: unknown, cap = 12): SpecField[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: SpecField[] = [];
  for (const f of arr) {
    const nf = normField(f, seen);
    if (nf) out.push(nf);
    if (out.length >= cap) break;
  }
  return out;
}

export function normalizeSpec(raw: unknown): StoreBackendSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const authMode = (["otp", "password", "none", "both"] as const).includes(
    (r.auth as { mode?: string })?.mode as never,
  )
    ? ((r.auth as { mode: "otp" | "password" | "none" | "both" }).mode)
    : "none";

  const pageWidgets: Record<string, WidgetKind> = {};
  const pw = (r.pageWidgets && typeof r.pageWidgets === "object" ? r.pageWidgets : {}) as Record<string, unknown>;
  for (const [slugRaw, kindRaw] of Object.entries(pw).slice(0, 40)) {
    const slug = slugify(slugRaw, 48);
    if (slug && WIDGET_KINDS.includes(kindRaw as WidgetKind)) pageWidgets[slug] = kindRaw as WidgetKind;
  }

  const collections: SpecCollection[] = [];
  const collSeen = new Set<string>();
  for (const c of (Array.isArray(r.collections) ? r.collections : []).slice(0, 24)) {
    if (!c || typeof c !== "object") continue;
    const cr = c as Record<string, unknown>;
    const name = slugify(String(cr.name ?? cr.label ?? ""), 24);
    if (!name || RESERVED.has(name) || collSeen.has(name)) continue;
    collSeen.add(name);
    const fields = normFields(cr.fields);
    if (!fields.length) continue;
    collections.push({
      name,
      label: String(cr.label ?? name).replace(/\s+/g, " ").trim().slice(0, 60) || name,
      onProduct: cr.onProduct === true,
      moderated: cr.moderated !== false, // default ON
      mineOnly: cr.mineOnly === true,
      fields,
    });
  }
  const collNames = new Set(collections.map((c) => c.name));

  const forms: SpecForm[] = [];
  for (const f of (Array.isArray(r.forms) ? r.forms : []).slice(0, 40)) {
    if (!f || typeof f !== "object") continue;
    const fr = f as Record<string, unknown>;
    const slot = slugify(String(fr.slot ?? ""), 48);
    const page = slugify(String(fr.page ?? ""), 48);
    if (!slot) continue;
    let target: SpecForm["target"];
    const tRaw = String(fr.target ?? "support");
    if (tRaw.startsWith("collection:")) {
      const cn = slugify(tRaw.slice("collection:".length), 24);
      if (!collNames.has(cn)) continue; // form points at a collection that survived validation, or drop it
      target = `collection:${cn}`;
    } else {
      target = FORM_TARGETS.includes(tRaw as FormTarget) ? (tRaw as FormTarget) : "support";
    }
    forms.push({
      slot,
      page,
      target,
      fields: normFields(fr.fields),
      submitLabel: fr.submitLabel ? String(fr.submitLabel).slice(0, 40) : undefined,
      successText: fr.successText ? String(fr.successText).slice(0, 160) : undefined,
    });
  }

  const accountTabs: StoreBackendSpec["accountTabs"] = [];
  for (const t of (Array.isArray(r.accountTabs) ? r.accountTabs : []).slice(0, 8)) {
    const s = String(t);
    if (s === "profile" || s === "orders" || s === "track") {
      if (!accountTabs.includes(s)) accountTabs.push(s);
    } else if (s.startsWith("collection:")) {
      const cn = slugify(s.slice("collection:".length), 24);
      if (collNames.has(cn) && !accountTabs.includes(`collection:${cn}`)) accountTabs.push(`collection:${cn}`);
    }
  }
  // an account widget with no tabs is useless — give it a sane default
  if (Object.values(pageWidgets).includes("account") && !accountTabs.length) accountTabs.push("orders", "profile");

  // NOT gated on "this kind is some page's pageWidgets value" — a widget like "track" is often
  // nested INSIDE another page (e.g. a tracking panel on the account page) rather than owning a
  // whole page itself, so it would never appear as a pageWidgets value even when legitimately
  // designed and field-verified. The real gate is Orbit Code's own field-by-field verification
  // before it ever sets this (see runOrbitCode) — here we only confirm the shape is a real kind.
  const claimedFreeform = Array.isArray(r.freeformWidgets) ? r.freeformWidgets : [];
  const freeformWidgets = WIDGET_KINDS.filter((k) => claimedFreeform.includes(k));

  return { version: 1, auth: { mode: authMode }, pageWidgets, collections, forms, accountTabs, freeformWidgets };
}

export function defaultSpec(): StoreBackendSpec {
  return { version: 1, auth: { mode: "none" }, pageWidgets: {}, collections: [], forms: [], accountTabs: [] };
}

export function parseSpec(json: string | null | undefined): StoreBackendSpec {
  if (!json) return defaultSpec();
  try {
    return normalizeSpec(JSON.parse(json));
  } catch {
    return defaultSpec();
  }
}

/** The collection a route/widget is asking for, only if the spec actually declares it. */
export function findCollection(spec: StoreBackendSpec, name: string): SpecCollection | null {
  const n = slugify(name, 24);
  return spec.collections.find((c) => c.name === n) ?? null;
}
