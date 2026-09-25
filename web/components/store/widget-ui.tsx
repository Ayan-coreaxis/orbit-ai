import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { statusLabel } from "@/lib/widget-copy";

export { statusLabel };

/** Token-styled primitives shared by the generic storefront widgets, so they inherit whatever
 * palette / radius / fonts the seller designed. */
export const wLabel: CSSProperties = { display: "grid", gap: 5, fontSize: 13, color: "var(--od-muted)" };
export const wInput: CSSProperties = {
  border: "1px solid var(--od-border)",
  borderRadius: "calc(var(--od-radius)*.6)",
  padding: "11px 13px",
  fontSize: 14,
  background: "var(--od-bg)",
  color: "var(--od-text)",
  width: "100%",
};
export const wBtn: CSSProperties = {
  background: "var(--od-accent)",
  color: "var(--od-accent-text)",
  border: "none",
  borderRadius: "var(--od-radius)",
  padding: "12px 18px",
  fontSize: 14.5,
  fontWeight: 600,
  cursor: "pointer",
};
export const wBtnGhost: CSSProperties = {
  background: "transparent",
  color: "var(--od-text)",
  border: "1px solid var(--od-border)",
  borderRadius: "var(--od-radius)",
  padding: "9px 14px",
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
};
export const wCard: CSSProperties = {
  border: "1px solid var(--od-border)",
  borderRadius: "var(--od-radius)",
  padding: 20,
  background: "var(--od-surface)",
};
export const wErr: CSSProperties = { color: "#ef4444", fontSize: 13, margin: 0 };
export const wHeading: CSSProperties = {
  fontFamily: "var(--od-font-heading)",
  fontWeight: "var(--od-heading-weight)" as unknown as number,
  fontSize: 20,
  color: "var(--od-text)",
  margin: 0,
};

/**
 * Shared CSS for the storefront widgets (cart / checkout / sign-in / account). Class-based so inputs
 * get real :focus / :hover states (inline styles can't), token-driven so it inherits the seller's
 * palette / radius / fonts. Rendered once per widget via <WidgetStyles/>; duplicate tags are fine.
 */
export const WIDGET_CSS = `
.odw{color:var(--od-text);font-size:14px;line-height:1.5}
.odw *,.odw *::before,.odw *::after{box-sizing:border-box}
.odw-card{border:1px solid color-mix(in srgb,var(--od-text) 10%,var(--od-border));border-radius:var(--od-radius);background:var(--od-surface);padding:clamp(16px,3vw,24px)}
.odw-h{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight,600);font-size:19px;color:var(--od-text);margin:0;letter-spacing:-.01em}
.odw-eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--od-muted);margin:0}
.odw-sub{font-size:13px;color:var(--od-muted);margin:5px 0 0;line-height:1.6}
.odw-field{display:grid;gap:6px}
.odw-label{font-size:12px;font-weight:500;color:var(--od-muted)}
.odw-label .opt{opacity:.65;font-weight:400}
.odw-input{width:100%;border:1px solid color-mix(in srgb,var(--od-text) 14%,var(--od-border));border-radius:calc(var(--od-radius) * .5);padding:11px 13px;font:inherit;font-size:14px;background:color-mix(in srgb,var(--od-text) 5%,var(--od-surface));color:var(--od-text);transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none}
.odw-input::placeholder{color:var(--od-muted);opacity:.7}
.odw-input:hover:not(:focus){border-color:color-mix(in srgb,var(--od-text) 24%,var(--od-border))}
.odw-input:focus{outline:none;border-color:var(--od-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--od-accent) 20%,transparent)}
textarea.odw-input{min-height:64px;resize:vertical;line-height:1.5}
select.odw-input{background-image:linear-gradient(45deg,transparent 50%,var(--od-muted) 50%),linear-gradient(135deg,var(--od-muted) 50%,transparent 50%);background-position:calc(100% - 18px) center,calc(100% - 13px) center;background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:36px}
.odw-btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--od-accent);color:var(--od-accent-text);border:none;border-radius:var(--od-radius);padding:13px 18px;font:inherit;font-weight:600;font-size:14.5px;cursor:pointer;transition:filter .15s,transform .04s}
.odw-btn:hover{filter:brightness(1.07)}
.odw-btn:active{transform:translateY(1px)}
.odw-btn:disabled{opacity:.5;cursor:default;filter:none}
.odw-btn-ghost{width:auto;background:transparent;color:var(--od-text);border:1px solid var(--od-border)}
.odw-btn-ghost:hover{filter:none;background:color-mix(in srgb,var(--od-text) 5%,transparent)}
.odw-link{color:var(--od-muted);font:inherit;font-size:13px;background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:2px;padding:2px}
.odw-link:hover{color:var(--od-text)}
.odw-seg{display:flex;gap:3px;padding:3px;border:1px solid var(--od-border);border-radius:calc(var(--od-radius) * .6);background:color-mix(in srgb,var(--od-text) 3%,var(--od-surface))}
.odw-seg button{flex:1;border:none;background:transparent;color:var(--od-muted);font:inherit;font-size:12.5px;font-weight:500;padding:8px 6px;border-radius:calc(var(--od-radius) * .45);cursor:pointer;transition:background .15s,color .15s}
.odw-seg button.on{background:var(--od-accent);color:var(--od-accent-text)}
.odw-tabs{display:flex;gap:2px;border-bottom:1px solid var(--od-border)}
.odw-tabs button{flex:1;border:none;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--od-muted);padding:10px 0;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s}
.odw-tabs button.on{color:var(--od-text);border-color:var(--od-accent)}
.odw-row{display:flex;justify-content:space-between;gap:12px;font-size:13.5px}
.odw-row>span:first-child{color:var(--od-muted)}
.odw-row.pos>span{color:var(--od-accent)}
.odw-total{display:flex;justify-content:space-between;padding-top:12px;margin-top:6px;border-top:1px solid var(--od-border);font-weight:700;font-size:16px}
.odw-checkout{display:grid;gap:22px;align-items:start}
@media(min-width:840px){.odw-checkout{grid-template-columns:minmax(0,1fr) 336px}.odw-summary-sticky{position:sticky;top:24px}}
.odw-grid2{display:grid;gap:12px;grid-template-columns:1fr 1fr}
@media(max-width:460px){.odw-grid2{grid-template-columns:1fr}}
.odw-steps{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--od-muted);margin-bottom:2px}
.odw-steps .cur{color:var(--od-text);font-weight:600}
.odw-item{display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--od-border)}
.odw-item:first-child{padding-top:0}
.odw-thumb{width:60px;height:60px;flex:none;object-fit:cover;border-radius:calc(var(--od-radius) * .45);background:color-mix(in srgb,var(--od-text) 7%,var(--od-surface))}
.odw-qty{display:inline-flex;align-items:center;border:1px solid var(--od-border);border-radius:calc(var(--od-radius) * .45);overflow:hidden;background:var(--od-surface)}
.odw-qty button{border:none;background:transparent;color:var(--od-text);width:28px;height:28px;font-size:15px;line-height:1;cursor:pointer}
.odw-qty button:hover{background:color-mix(in srgb,var(--od-text) 7%,transparent)}
.odw-qty span{min-width:26px;text-align:center;font-size:13px}
.odw-mini{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:5px 0}
.odw-mini span:first-child{color:var(--od-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.odw-err{color:#ef4444;font-size:12.5px;margin:0}
.odw-bul{display:flex;gap:9px;font-size:13px;color:var(--od-text);align-items:flex-start}
.odw-bul svg{flex:none;margin-top:1px;color:var(--od-accent)}
.odw-note{font-size:12px;color:var(--od-muted);margin:0}
.odw-toast-host{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;display:grid;gap:8px;justify-items:center;pointer-events:none}
.odw-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;max-width:min(90vw,380px);background:var(--od-text);color:var(--od-bg);font-size:13.5px;font-weight:500;border-radius:calc(var(--od-radius)*.6);padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:od-toast-in .22s ease-out}
.odw-toast.err{background:#ef4444;color:#fff}
.odw-toast.leaving{animation:od-toast-out .18s ease-in forwards}
@keyframes od-toast-in{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes od-toast-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(6px) scale(.97)}}
.odw-success-overlay{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--od-bg);animation:od-overlay-in .25s ease-out}
.odw-success-overlay .odw-success-label{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight,600);font-size:17px;color:var(--od-text);opacity:0;animation:od-label-in .3s ease-out .35s forwards}
@keyframes od-overlay-in{from{opacity:0}to{opacity:1}}
@keyframes od-label-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.odw-check{color:var(--od-accent)}
.odw-check circle{stroke-dasharray:126;stroke-dashoffset:126;animation:od-check-ring .5s ease-out forwards}
.odw-check path{stroke-dasharray:24;stroke-dashoffset:24;animation:od-check-tick .25s ease-out .4s forwards}
@keyframes od-check-ring{to{stroke-dashoffset:0}}
@keyframes od-check-tick{to{stroke-dashoffset:0}}
.odw-plane{color:var(--od-accent);animation:od-plane-fly .9s cubic-bezier(.4,0,.2,1) forwards}
@keyframes od-plane-fly{0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}55%{transform:translate(40px,-30px) rotate(18deg) scale(1.05);opacity:1}100%{transform:translate(160px,-120px) rotate(24deg) scale(.7);opacity:0}}
.odw-confetti{position:fixed;top:50%;left:50%;width:9px;height:14px;pointer-events:none;animation:od-confetti-burst var(--od-dur,1.1s) cubic-bezier(.2,.7,.3,1) forwards;animation-delay:var(--od-delay,0s)}
@keyframes od-confetti-burst{0%{transform:translate(-50%,-50%) rotate(0deg);opacity:1}100%{transform:translate(calc(-50% + var(--od-x)),calc(-50% + var(--od-y))) rotate(var(--od-rot));opacity:0}}
`;

export function WidgetStyles() {
  return <style dangerouslySetInnerHTML={{ __html: WIDGET_CSS }} />;
}

export interface ToastItem {
  id: number;
  text: string;
  kind: "ok" | "err";
  leaving?: boolean;
}

/** A small "Order cancelled" / "Couldn't submit" style toast — replaces raw browser alert()s in the
 *  storefront's own widgets. `push(text)` for a neutral/success toast, `push(text, "err")` for an
 *  error; auto-dismisses after ~3.2s with a brief leave animation. Render <ToastHost items={items}/>
 *  once near the root of whatever widget uses this. */
export function useToast(): [ToastItem[], (text: string, kind?: "ok" | "err") => void] {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = ++nextId.current;
    setItems((cur) => [...cur, { id, text, kind }]);
    setTimeout(() => {
      setItems((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 180);
    }, 3200);
  }, []);

  return [items, push];
}

export function ToastHost({ items }: { items: ToastItem[] }) {
  if (!items.length) return null;
  return (
    <div className="odw-toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`odw-toast ${t.kind === "err" ? "err" : ""} ${t.leaving ? "leaving" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** How long to hold `<SuccessOverlay/>` on screen (ms) before navigating away, per `Business.widgetMotion`.
 *  "none" is 0 — callers should skip rendering the overlay entirely rather than navigate-after-0. */
export const MOTION_DURATION_MS: Record<string, number> = { none: 0, standard: 550, playful: 950, premium: 1150 };

/** The "your order is placed" transition moment — the one spot sellers previously had zero control
 *  over (an instant redirect with no animation at all). Driven by `Business.widgetMotion`:
 *  "standard" draws a checkmark, "playful"/"premium" fly a paper plane off toward the top-right, "none"
 *  renders nothing (caller should skip it and navigate immediately). Mount only while `active`. */
const CONFETTI_COLORS = ["var(--od-accent)", "#ffd166", "#ef476f", "#06d6a0", "#118ab2"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 90 + Math.random() * 110;
        return {
          key: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 40,
          rot: Math.round(Math.random() * 540 - 270),
          delay: Math.random() * 0.15,
          dur: 0.9 + Math.random() * 0.5,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        };
      }),
    [],
  );
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.key}
          className="odw-confetti"
          style={
            {
              background: p.color,
              "--od-x": `${p.x}px`,
              "--od-y": `${p.y}px`,
              "--od-rot": `${p.rot}deg`,
              "--od-delay": `${p.delay}s`,
              "--od-dur": `${p.dur}s`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

export function SuccessOverlay({ motion, label }: { motion: string; label: string }) {
  if (motion === "none") return null;
  const flying = motion === "playful" || motion === "premium";
  return (
    <div className="odw-success-overlay" role="status" aria-live="polite">
      {motion === "premium" && <Confetti />}
      {flying ? (
        <svg className="odw-plane" width="52" height="52" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21.5 2.5 2.5 10.2c-.7.28-.66 1.28.06 1.5l7.2 2.24 2.24 7.2c.22.72 1.22.76 1.5.06L21.5 2.5Z" />
        </svg>
      ) : (
        <svg className="odw-check" width="52" height="52" viewBox="0 0 44 44" fill="none" aria-hidden>
          <circle cx="22" cy="22" r="20" stroke="currentColor" strokeWidth="2.5" />
          <path d="M13 22.5 19 28.5 31 15.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="odw-success-label">{label}</span>
    </div>
  );
}

export function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7.5 5.5 10.5 11.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function money(n: number, currency?: string): string {
  const sym = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "Rs ";
  return `${sym}${Math.round(n).toLocaleString()}`;
}

