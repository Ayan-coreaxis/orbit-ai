"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addToCart, lineKey, readCart, setQty, CART_EVENT } from "@/app/store/cart-store";
import { clearCart } from "@/app/store/cart-store";
import { firePixel } from "@/lib/pixel-client";
import { isSystemPage, priceLine, type SiteLine, type SiteProduct } from "@/lib/store-site";

export interface PickedEl {
  tag: string;
  cls: string;
  text: string;
  where: string;
  texts: { from: string; now: string; product: boolean }[];
  image: string | null;
  imageIsProduct: boolean;
  link: { href: string; from: string; text: string } | null;
}

const newToken = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);

/** Everything a store page may ask the server for. Items always come from the shopper's own cart here. */
async function storeApi(businessId: string, op: string, d: Record<string, unknown>, token: { current: string }): Promise<Record<string, unknown>> {
  const base = `/api/store/${businessId}`;
  const items = readCart(businessId).map((l) => (l.bundleId ? { bundleId: l.bundleId, qty: l.qty } : { productId: l.productId, variantId: l.variantId ?? undefined, qty: l.qty }));
  const str = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const get = (p: string) => fetch(base + p).then((r) => r.json());
  const post = async (p: string, body: object) => {
    const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, ok: false, error: j.error ?? "That didn't work. Please try again." };
  };
  switch (op) {
    case "me":
      return get("/auth/me");
    case "login":
    case "signup":
    case "otp-request":
    case "otp-verify":
      return post(`/auth/${op}`, { name: str(d.name), email: str(d.email), phone: str(d.phone, 40), password: str(d.password), code: str(d.code, 12) });
    case "logout":
      return post("/auth/logout", {});
    case "orders":
      return get("/orders");
    case "addresses":
      return get("/account/addresses");
    case "loyalty":
      return get("/loyalty");
    case "cities":
      return get("/cities");
    case "options": {
      const lines = readCart(businessId);
      fetch(`${base}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "checkout_start" }) }).catch(() => {});
      firePixel("checkout_start", { content_ids: lines.map((l) => l.productId).filter((x): x is string => !!x), num_items: lines.reduce((s, l) => s + l.qty, 0) });
      return get("/checkout/options");
    }
    case "quote":
      return post("/coupon", { items, code: str(d.code, 60), giftCardCode: str(d.giftCardCode, 60), phone: str(d.phone, 40), city: str(d.city, 80), loyaltyPointsRedeem: Math.max(0, Math.floor(Number(d.points) || 0)) });
    case "abandoned":
      return post("/abandoned", { items, phone: str(d.phone, 40) });
    case "place": {
      const s = obj(d.shipping);
      const r = await post("/checkout", {
        items,
        customerName: str(d.customerName),
        customerPhone: str(d.customerPhone, 40),
        customerEmail: str(d.customerEmail),
        shipping: { line1: str(s.line1), city: str(s.city, 80), area: str(s.area, 80), postalCode: str(s.postalCode, 20) },
        couponCode: str(d.couponCode, 60) || undefined,
        giftCardCode: str(d.giftCardCode, 60) || undefined,
        loyaltyPointsRedeem: Math.max(0, Math.floor(Number(d.loyaltyPointsRedeem) || 0)) || undefined,
        payment: str(d.payment, 20),
        clientToken: token.current,
        customFields: obj(d.customFields),
      });
      if (r.error) return r;
      token.current = newToken();
      if (typeof r.redirect === "string") {
        if (d.payment !== "stripe") clearCart(businessId); // a wallet order already exists; its page offers a retry
        window.location.href = r.redirect;
        return { redirect: true };
      }
      clearCart(businessId);
      return r;
    }
    default:
      return { error: "Unknown request." };
  }
}

/**
 * Shows one page of an agent-built store in a sandboxed frame and answers its window.ORBIT calls.
 * The frame has an opaque origin: it can't read cookies, storage or Orbit's pages. Everything it asks
 * for is checked here — prices come from our product list, never from the frame.
 */
export function SiteFrame({
  src,
  businessId,
  products,
  live,
  onGo,
  pick = false,
  onPicked,
  onNotice,
  className,
  title = "Store",
}: {
  src: string;
  businessId: string;
  products: SiteProduct[];
  live: boolean;
  onGo: (to: string, id: string | null) => void;
  pick?: boolean;
  onPicked?: (p: PickedEl) => void;
  onNotice?: (t: string) => void;
  className?: string;
  title?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const demo = useRef<SiteLine[]>([]);
  const token = useRef(newToken()); // one per checkout attempt: a double-submitted order is created once
  // Fetched and shown as srcdoc: the sandbox attribute gives it an opaque origin, its own meta CSP
  // limits what it loads, and the page before stays on screen until the next one is ready.
  const [page, setPage] = useState<{ src: string; html: string } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(src, { signal: ac.signal, cache: "no-store" })
      .then(async (r) => (r.ok ? setPage({ src, html: await r.text() }) : onNotice?.("That page couldn't be opened.")))
      .catch((e) => {
        if (!ac.signal.aborted) console.error(e);
      });
    return () => ac.abort();
  }, [src, onNotice]);

  const post = useCallback((m: object) => frame.current?.contentWindow?.postMessage({ __orbit: 1, ...m }, "*"), []);
  const lines = useCallback((): SiteLine[] => {
    if (!live) return demo.current;
    return readCart(businessId).map((l) => ({ key: lineKey(l), productId: l.productId ?? "", variantId: l.variantId ?? null, variantLabel: l.variantLabel ?? null, name: l.name, price: l.price, qty: l.qty, image: l.imageUrl }));
  }, [businessId, live]);
  const pushCart = useCallback(() => post({ t: "cart", lines: lines() }), [post, lines]);

  useEffect(() => {
    async function onMsg(e: MessageEvent) {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { __orbit?: number; t?: string; productId?: unknown; variantId?: unknown; qty?: unknown; key?: unknown; to?: unknown; id?: unknown; n?: unknown; data?: Record<string, unknown> } | null;
      if (!d || d.__orbit !== 1) return;
      if (d.t === "ready") {
        pushCart();
        post({ t: "pick", on: pick });
      } else if (d.t === "add") {
        const l = priceLine(products, d.productId, d.variantId);
        const qty = Math.max(1, Math.min(99, Math.floor(Number(d.qty)) || 1));
        if (!l) return;
        if (live) {
          addToCart(businessId, { productId: l.productId, variantId: l.variantId, variantLabel: l.variantLabel, name: l.name, price: l.price, imageUrl: l.image }, qty);
          fetch(`/api/store/${businessId}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "add_to_cart", productId: l.productId }) }).catch(() => {});
        } else {
          const has = demo.current.find((x) => x.key === l.key);
          demo.current = has ? demo.current.map((x) => (x.key === l.key ? { ...x, qty: x.qty + qty } : x)) : [...demo.current, { ...l, qty }];
        }
        pushCart();
      } else if (d.t === "qty") {
        const q = Math.max(0, Math.min(99, Math.floor(Number(d.qty)) || 0));
        if (live) setQty(businessId, String(d.key), q);
        else demo.current = demo.current.map((x) => (x.key === d.key ? { ...x, qty: q } : x)).filter((x) => x.qty > 0);
        pushCart();
      } else if (d.t === "go" && typeof d.to === "string" && /^[a-z0-9-]{1,50}$/.test(d.to)) {
        onGo(d.to, typeof d.id === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(d.id) ? d.id : null);
      } else if ((d.t === "contact" || d.t === "newsletter") && typeof d.n === "number") {
        const s = (k: string) => String(d.data?.[k] ?? "").slice(0, 4000);
        let result: { ok: boolean; error?: string } = { ok: true };
        if (!live) onNotice?.("Forms send for real on your live store.");
        else {
          const payload = d.t === "contact" ? { name: s("name"), email: s("email"), message: s("message") } : { email: s("email") };
          result = await fetch(`/api/store/${businessId}/${d.t}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
            .then((r) => r.json())
            .catch(() => ({ ok: false, error: "Network error. Please try again." }));
        }
        post({ t: "reply", n: d.n, result: { ok: !!result.ok, error: result.error } });
      } else if (d.t === "api" && typeof d.n === "number" && live) {
        const q = (d.data ?? {}) as { op?: unknown; data?: unknown };
        const result = await storeApi(businessId, String(q.op), (q.data && typeof q.data === "object" ? q.data : {}) as Record<string, unknown>, token).catch(() => ({ ok: false, error: "Network error. Please try again." }));
        post({ t: "reply", n: d.n, result });
      } else if (d.t === "picked") {
        const p = e.data as Record<string, unknown>;
        const l = p.link as PickedEl["link"];
        onPicked?.({
          tag: String(p.tag ?? "").slice(0, 20),
          cls: String(p.cls ?? "").slice(0, 80),
          text: String(p.text ?? "").slice(0, 120),
          where: String(p.where ?? "").slice(0, 80),
          texts: (Array.isArray(p.texts) ? p.texts : []).slice(0, 6).map((x: Record<string, unknown>) => ({ from: String(x.from ?? ""), now: String(x.now ?? ""), product: !!x.product })),
          image: typeof p.image === "string" ? p.image.slice(0, 600) : null,
          imageIsProduct: !!p.imageIsProduct,
          link: l && typeof l === "object" ? { href: String(l.href ?? "").slice(0, 300), from: String(l.from ?? "").slice(0, 300), text: String(l.text ?? "").slice(0, 200) } : null,
        });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [businessId, products, live, onGo, pick, onPicked, onNotice, post, pushCart]);

  useEffect(() => {
    if (!live) return;
    window.addEventListener(CART_EVENT, pushCart);
    window.addEventListener("storage", pushCart);
    return () => {
      window.removeEventListener(CART_EVENT, pushCart);
      window.removeEventListener("storage", pushCart);
    };
  }, [live, pushCart]);

  useEffect(() => {
    post({ t: "pick", on: pick });
  }, [pick, post]);

  if (!page) return null;
  return <iframe key={page.src} ref={frame} srcDoc={page.html} title={title} className={className} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" allow="fullscreen" />;
}

/** The live store: full-window frame, with real addresses and back/forward. */
export function LiveSite({ businessId, storeName, slug, productId, orderId = null, pages, products, bg }: { businessId: string; storeName: string; slug: string; productId: string | null; orderId?: string | null; pages: string[]; products: SiteProduct[]; bg: string }) {
  const [at, setAt] = useState({ slug, productId, orderId, seen: false });
  const base = `/store/${businessId}`;

  useEffect(() => {
    function read() {
      const path = location.pathname.replace(base, "").replace(/\/$/, "");
      const p = /^\/p\/([a-z0-9-]+)/.exec(path)?.[1];
      const id = /^\/product\/([A-Za-z0-9_-]+)/.exec(path)?.[1] ?? null;
      const order = /^\/order\/([A-Za-z0-9_-]+)/.exec(path)?.[1] ?? null;
      const sys = ({ "/cart": "cart", "/checkout": "checkout", "/account": "account", "/account/login": "login" } as Record<string, string>)[path];
      setAt({ slug: id ? "product" : order ? "thanks" : (sys ?? p ?? "home"), productId: id, orderId: order, seen: true });
    }
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [base]);

  const go = useCallback(
    (to: string, id: string | null) => {
      const leave = (u: string) => window.location.assign(u);
      if (to === "account-more") return leave(`${base}/account?full=1`);
      if (to === "product" && id && !pages.includes("product")) return leave(`${base}/product/${id}`);
      const order = to === "order" ? id : null;
      if (to === "order" && !order) return;
      if (to !== "order" && !isSystemPage(to) && !pages.includes(to)) return;
      const url = order ? `${base}/order/${order}` : to === "home" ? base : to === "product" && id ? `${base}/product/${id}` : to === "login" ? `${base}/account/login` : isSystemPage(to) ? `${base}/${to}` : `${base}/p/${to}`;
      if (order) return leave(url); // the server settles the order (pixel, payment) before it is shown
      history.pushState(null, "", url);
      setAt({ slug: to, productId: to === "product" ? id : null, orderId: null, seen: true });
    },
    [base, pages],
  );

  const q = new URLSearchParams({ page: at.slug });
  if (at.productId) q.set("product", at.productId);
  if (at.orderId) q.set("order", at.orderId);
  if (at.seen) q.set("seen", "1");
  return (
    <div style={{ position: "fixed", inset: 0, background: bg }}>
      <SiteFrame src={`/api/store/${businessId}/site?${q}`} businessId={businessId} products={products} live onGo={go} title={storeName} className="block h-full w-full border-0" />
    </div>
  );
}
