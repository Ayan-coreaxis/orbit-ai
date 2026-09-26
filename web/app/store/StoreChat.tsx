"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-store";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["What are the delivery charges?", "Do you have cash on delivery?", "What sells the most?"];

/**
 * Floating "Ask us" chat bubble on the storefront. Replies come from the store chatbot (grounded in
 * the real catalog + delivery settings); the conversation is kept server-side and shows up in the
 * seller's Inbox. Renders nothing when the seller turned chat off.
 */
export function StoreChat({ businessId, storeName, vars }: { businessId: string; storeName?: string; vars: React.CSSProperties }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cartCount = useCart(businessId).reduce((s, l) => s + l.qty, 0);
  const pathname = usePathname() ?? "";
  const pillShowing = cartCount > 0 && !/\/cart\/?$/.test(pathname);

  useEffect(() => {
    let live = true;
    fetch(`/api/store/${businessId}/chat`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { enabled?: boolean; messages?: Msg[] } | null) => {
        if (!live || !d) return;
        setEnabled(!!d.enabled);
        setMsgs(d.messages ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [businessId]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setErr(null);
    setText("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const r = await fetch(`/api/store/${businessId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const d = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!r.ok || !d.reply) {
        setErr(d.error ?? (r.status === 429 ? "Too many messages — wait a minute." : "Couldn't send. Try again."));
        setMsgs((m) => m.slice(0, -1));
        setText(message);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: d.reply! }]);
      }
    } catch {
      setErr("You seem to be offline.");
      setMsgs((m) => m.slice(0, -1));
      setText(message);
    } finally {
      setBusy(false);
    }
  }

  const bottom = pillShowing ? 84 : 20;

  return (
    <div style={{ ...vars, fontFamily: "var(--od-font-body)" }}>
      <style>{CSS}</style>
      {open && (
        <div className="osc-panel" role="dialog" aria-label={`Chat with ${storeName ?? "the store"}`} style={{ bottom: bottom + 68 }}>
          <div className="osc-head">
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{storeName ?? "Chat with us"}</div>
              <div style={{ fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="osc-dot" /> Usually replies instantly
              </div>
            </div>
            <button className="osc-x" onClick={() => setOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>
          <div className="osc-list" ref={listRef}>
            <div className="osc-msg osc-bot">Hi! Ask me anything about our products, prices or delivery.</div>
            {msgs.map((m, i) => (
              <div key={i} className={`osc-msg ${m.role === "user" ? "osc-me" : "osc-bot"}`}>
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="osc-msg osc-bot osc-typing" aria-label="Typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {msgs.length === 0 && !busy && (
              <div className="osc-sugs">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {err && <div className="osc-err">{err}</div>}
          <form
            className="osc-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Type your question…" aria-label="Message" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </form>
        </div>
      )}
      <button className="osc-bubble" style={{ bottom }} onClick={() => setOpen((o) => !o)} aria-label={open ? "Close chat" : "Open chat"} aria-expanded={open}>
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

const CSS = `
.osc-bubble{position:fixed;right:16px;z-index:65;width:56px;height:56px;border-radius:999px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:var(--od-accent);color:var(--od-accent-text);box-shadow:0 10px 30px -8px rgba(0,0,0,.35);transition:transform .2s ease,bottom .25s ease;animation:oscPop .35s cubic-bezier(.2,.9,.3,1.3)}
.osc-bubble:hover{transform:scale(1.06)}
.osc-bubble:active{transform:scale(.96)}
.osc-panel{position:fixed;right:16px;z-index:66;width:min(370px,calc(100vw - 32px));height:min(520px,calc(100dvh - 180px));display:flex;flex-direction:column;background:var(--od-bg);color:var(--od-text);border:1px solid var(--od-border);border-radius:calc(var(--od-radius) + 6px);box-shadow:0 24px 60px -16px rgba(0,0,0,.35);overflow:hidden;transform-origin:bottom right;animation:oscIn .22s cubic-bezier(.2,.9,.3,1.1)}
.osc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:var(--od-accent);color:var(--od-accent-text)}
.osc-x{background:transparent;border:none;color:inherit;font-size:26px;line-height:1;cursor:pointer;opacity:.85;padding:0 4px}
.osc-dot{width:7px;height:7px;border-radius:99px;background:#34d399;display:inline-block}
.osc-list{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
.osc-msg{max-width:84%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;animation:oscUp .2s ease}
.osc-bot{align-self:flex-start;background:var(--od-surface);border:1px solid var(--od-border);border-bottom-left-radius:5px}
.osc-me{align-self:flex-end;background:var(--od-accent);color:var(--od-accent-text);border-bottom-right-radius:5px}
.osc-typing{display:flex;gap:4px;padding:12px 14px}
.osc-typing span{width:6px;height:6px;border-radius:99px;background:var(--od-muted);animation:oscDot 1s infinite ease-in-out}
.osc-typing span:nth-child(2){animation-delay:.15s}.osc-typing span:nth-child(3){animation-delay:.3s}
.osc-sugs{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.osc-sugs button{font:inherit;font-size:12.5px;padding:6px 11px;border-radius:999px;border:1px solid var(--od-border);background:transparent;color:var(--od-text);cursor:pointer}
.osc-sugs button:hover{border-color:var(--od-accent);color:var(--od-accent)}
.osc-err{padding:6px 14px;font-size:12.5px;color:#dc2626}
.osc-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--od-border)}
.osc-form input{flex:1;min-width:0;font:inherit;font-size:16px;padding:10px 12px;border-radius:999px;border:1px solid var(--od-border);background:var(--od-surface);color:var(--od-text);outline:none}
.osc-form input:focus{border-color:var(--od-accent)}
.osc-form button{width:42px;height:42px;flex-shrink:0;border-radius:999px;border:none;background:var(--od-accent);color:var(--od-accent-text);display:flex;align-items:center;justify-content:center;cursor:pointer}
.osc-form button:disabled{opacity:.45;cursor:default}
@keyframes oscPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes oscIn{from{transform:translateY(12px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes oscUp{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
@keyframes oscDot{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.osc-bubble,.osc-panel,.osc-msg{animation:none}.osc-typing span{animation:none}}
`;
