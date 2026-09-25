"use client";

/** Guest cart, per store, in localStorage. No accounts — this is the whole cart system. */

export interface CartLine {
  productId?: string; // present for a standalone product line
  bundleId?: string; // present for a bundle line (mutually exclusive with productId) — price is the bundle's flat price
  variantId?: string | null;
  variantLabel?: string | null;
  name: string;
  price: number;
  qty: number;
  imageUrl: string | null;
}

const key = (businessId: string) => `od_cart_${businessId}`;
export const CART_EVENT = "od-cart-change";

/** A cart line is identified by product + chosen variant (so "M" and "L" are separate lines), or
 *  by bundle id for a bundle line. */
export function lineKey(l: { productId?: string; bundleId?: string; variantId?: string | null }): string {
  return `${l.productId ?? `bundle:${l.bundleId}`}::${l.variantId ?? ""}`;
}

export function readCart(businessId: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(businessId));
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && (l.productId || l.bundleId) && l.qty > 0) : [];
  } catch {
    return [];
  }
}

function write(businessId: string, lines: CartLine[]) {
  try {
    localStorage.setItem(key(businessId), JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { businessId } }));
  } catch {
    /* private mode / quota — cart just won't persist */
  }
}

export function addToCart(businessId: string, line: Omit<CartLine, "qty">, qty = 1) {
  const lines = readCart(businessId);
  const k = lineKey(line);
  const existing = lines.find((l) => lineKey(l) === k);
  if (existing) existing.qty += qty;
  else lines.push({ ...line, qty });
  write(businessId, lines);
}

export function setQty(businessId: string, k: string, qty: number) {
  let lines = readCart(businessId);
  if (qty <= 0) lines = lines.filter((l) => lineKey(l) !== k);
  else lines = lines.map((l) => (lineKey(l) === k ? { ...l, qty } : l));
  write(businessId, lines);
}

export function clearCart(businessId: string) {
  write(businessId, []);
}

export function cartCount(businessId: string): number {
  return readCart(businessId).reduce((s, l) => s + l.qty, 0);
}

export function cartTotal(businessId: string): number {
  return readCart(businessId).reduce((s, l) => s + l.qty * l.price, 0);
}
