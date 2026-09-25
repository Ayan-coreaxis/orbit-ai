"use client";

/**
 * The "add to cart" moment, made visible: a small clone of the product image arcs from the button
 * that was clicked to the header's cart link, then the cart badge pops. Pure DOM/WAAPI — no React
 * state, so it works from any client component without prop-drilling a ref up to the header (which
 * is server-rendered HTML, not a React tree the widgets share).
 */

let cssInjected = false;
function ensureCss() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
@keyframes od-cart-badge-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
.od-cart-badge-pop{animation:od-cart-badge-pop .38s cubic-bezier(.34,1.56,.64,1)}
`;
  document.head.appendChild(style);
}

export function flyToCart(sourceEl: HTMLElement | null, imageUrl: string | null | undefined, motion: string) {
  if (motion === "none" || typeof document === "undefined") return;
  const cartLink = document.querySelector<HTMLElement>('a[href$="/cart"]');
  if (!sourceEl || !cartLink) return;
  ensureCss();

  const from = sourceEl.getBoundingClientRect();
  const to = cartLink.getBoundingClientRect();
  const size = 42;

  const clone = document.createElement(imageUrl ? "img" : "div");
  if (imageUrl) (clone as HTMLImageElement).src = imageUrl;
  clone.style.cssText = `position:fixed;left:${from.left + from.width / 2 - size / 2}px;top:${from.top + from.height / 2 - size / 2}px;width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;background:var(--od-accent,#888);z-index:9998;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.25)`;
  document.body.appendChild(clone);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const arcLift = motion === "premium" ? -140 : -90;
  const duration = motion === "premium" ? 750 : 550;

  const anim = clone.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + arcLift}px) scale(.7)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0.3, offset: 1 },
    ],
    { duration, easing: "cubic-bezier(.4,0,.2,1)" },
  );
  anim.onfinish = () => {
    clone.remove();
    const badge = cartLink.querySelector<HTMLElement>("[data-od-cart-count]");
    if (badge) {
      badge.classList.remove("od-cart-badge-pop");
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void badge.offsetWidth; // restart the animation if it's still mid-pop from a rapid add
      badge.classList.add("od-cart-badge-pop");
    }
  };
}
