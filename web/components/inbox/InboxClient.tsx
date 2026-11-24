"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Loader2, MessageCircle, Search, Send, Trash2, UserRound } from "lucide-react";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/icons/BrandIcons";
import { Pill } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ago, initials } from "@/lib/inbox";

export interface InboxMessage {
  id: string;
  role: "user" | "assistant";
  sender: "bot" | "owner" | null;
  content: string;
  at: string;
}
export interface InboxOrder {
  id: string;
  totalLabel: string;
  status: string;
  at: string;
}
export interface InboxConversation {
  key: string;
  channel: string;
  customerRef: string;
  name: string;
  demo: boolean;
  messages: InboxMessage[];
  lastAt: string;
  orders: InboxOrder[];
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs reply" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "messenger", label: "Messenger" },
  { id: "website", label: "Website" },
] as const;
const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", website: "Website chat" };
const QUICK = ["Ji, abhi check karke batata hoon.", "Cash on delivery is available.", "Your order is on its way 🚚", "Thank you for your order! 🌿"];
const READ_KEY = "orbit.inbox.read";

function Channel({ channel, size = 16 }: { channel: string; size?: number }) {
  if (channel === "whatsapp") return <WhatsAppIcon size={size} />;
  if (channel === "instagram") return <InstagramIcon size={size} />;
  if (channel === "messenger") return <FacebookIcon size={size} />;
  return <MessageCircle style={{ width: size, height: size }} className="text-text-faint" />;
}

const needsReply = (c: InboxConversation) => c.messages[c.messages.length - 1]?.role === "user";

export function InboxClient({ initial, hasDemo }: { initial: InboxConversation[]; hasDemo: boolean }) {
  const router = useRouter();
  const [convs, setConvs] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(initial[0]?.key ?? null);
  const [read, setRead] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({}); // message id → delivery note
  const [mobileThread, setMobileThread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConvs(initial);
  }, [initial]);
  useEffect(() => {
    try {
      setRead(JSON.parse(localStorage.getItem(READ_KEY) ?? "{}"));
    } catch {
      /* private mode */
    }
  }, []);

  const active = convs.find((c) => c.key === activeKey) ?? null;
  useEffect(() => {
    if (!active) return;
    setRead((r) => {
      if (r[active.key] === active.lastAt) return r;
      const next = { ...r, [active.key]: active.lastAt };
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }, [active]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeKey, active?.messages.length]);

  const unread = (c: InboxConversation) => needsReply(c) && read[c.key] !== c.lastAt;
  const counts = useMemo(() => ({ needs: convs.filter(needsReply).length }), [convs]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return convs
      .filter((c) => (filter === "all" ? true : filter === "needs" ? needsReply(c) : c.channel === filter))
      .filter((c) => !t || c.name.toLowerCase().includes(t) || c.messages.some((m) => m.content.toLowerCase().includes(t)))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [convs, filter, q]);

  async function send(body: string) {
    if (!active || !body.trim() || sending) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    const at = new Date().toISOString();
    const push = (id: string) =>
      setConvs((all) =>
        all.map((c) =>
          c.key === active.key ? { ...c, lastAt: at, messages: [...c.messages, { id, role: "assistant", sender: "owner", content: body.trim(), at }] } : c,
        ),
      );
    push(tempId);
    setText("");
    try {
      const r = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: active.channel, customerRef: active.customerRef, text: body }),
      });
      const d = (await r.json()) as { note?: string; error?: string; id?: string };
      setNotes((n) => ({ ...n, [tempId]: d.error ?? d.note ?? "" }));
    } catch {
      setNotes((n) => ({ ...n, [tempId]: "Couldn't reach the server — try again." }));
    } finally {
      setSending(false);
    }
  }

  async function clearDemo() {
    await fetch("/api/inbox/demo", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {hasDemo && (
        <div className="glass flex flex-col items-start gap-2.5 rounded-[20px] px-4 py-3 text-[14.5px] sm:flex-row sm:items-center sm:gap-3">
          <Pill tone="warn">Demo</Pill>
          <span className="min-w-0 sm:flex-1">These are sample conversations so you can see how the Inbox works. Replies to them are saved here but never sent.</span>
          <button onClick={clearDemo} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-text-dim hover:bg-panel hover:text-text">
            <Trash2 className="h-4 w-4" /> Remove demo
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:h-[calc(100dvh-330px)] lg:min-h-[520px] lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ---------- list ---------- */}
        <section className={cn("app-card flex min-h-0 flex-col overflow-hidden p-0", mobileThread && "hidden lg:flex")}>
          <div className="space-y-3 border-b border-border p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search names or messages"
                className="w-full rounded-full border border-border bg-panel py-2.5 pl-10 pr-4 text-[14.5px] outline-none focus:border-accent"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
                    filter === f.id ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text",
                  )}
                >
                  {f.label}
                  {f.id === "needs" && counts.needs > 0 && <span className={cn("ml-1.5", filter === f.id ? "text-white/85" : "text-tomato-strong")}>{counts.needs}</span>}
                </button>
              ))}
            </div>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 && <li className="p-8 text-center text-[14.5px] text-text-dim">Nothing matches.</li>}
            {list.map((c) => {
              const last = c.messages[c.messages.length - 1];
              const on = c.key === activeKey;
              return (
                <li key={c.key}>
                  <button
                    onClick={() => {
                      setActiveKey(c.key);
                      setMobileThread(true);
                    }}
                    className={cn("flex w-full items-start gap-3 border-b border-border px-4 py-3.5 text-left transition-colors", on ? "bg-accent-soft" : "hover:bg-panel-2")}
                  >
                    <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[15px] font-semibold text-accent">
                      {initials(c.name)}
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-panel ring-2 ring-[var(--panel)]">
                        <Channel channel={c.channel} size={13} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-[15.5px]", unread(c) ? "font-semibold" : "font-medium")}>{c.name}</span>
                        <span className="ml-auto shrink-0 text-[13px] text-text-faint">{ago(c.lastAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn("block truncate text-[14px]", unread(c) ? "text-text" : "text-text-dim")}>
                          {last.role === "assistant" ? (last.sender === "owner" ? "You: " : "Orbit AI: ") : ""}
                          {last.content}
                        </span>
                        {unread(c) && <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-tomato" aria-label="Needs a reply" />}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- thread ---------- */}
        <section className={cn("app-card flex min-h-[520px] min-w-0 flex-col overflow-hidden p-0 lg:min-h-0", !mobileThread && "hidden lg:flex")}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-10 text-[15px] text-text-dim">Pick a conversation.</div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-4 sm:px-5">
                <button onClick={() => setMobileThread(false)} className="rounded-full px-3 py-1.5 text-[14px] font-medium text-text-dim hover:bg-panel-2 lg:hidden">
                  ← Back
                </button>
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[15px] font-semibold text-accent sm:flex">{initials(active.name)}</span>
                <div className="min-w-0 flex-1 basis-[150px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold tracking-tight">{active.name}</h2>
                    {active.demo && <Pill tone="warn">Demo</Pill>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[14px] text-text-dim">
                    <Channel channel={active.channel} size={14} /> {CHANNEL_LABEL[active.channel] ?? active.channel}
                    {active.orders.length > 0 && <span>· {active.orders.length} order{active.orders.length === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                {needsReply(active) && <Pill tone="bad">Needs a reply</Pill>}
              </header>

              {active.orders.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-border bg-panel-2/60 px-5 py-2.5 text-[14px]">
                  {active.orders.slice(0, 3).map((o) => (
                    <span key={o.id} className="rounded-full bg-panel px-3 py-1 text-text-dim">
                      Order #{o.id.slice(-6).toUpperCase()} · {o.totalLabel} · {o.status}
                    </span>
                  ))}
                </div>
              )}

              <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5">
                {active.messages.map((m) => {
                  const mine = m.role === "assistant";
                  const owner = m.sender === "owner";
                  return (
                    <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                      <div className="mb-1 flex items-center gap-1.5 px-1 text-[13px] text-text-faint">
                        {mine ? owner ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" /> : null}
                        {mine ? (owner ? "You" : "Orbit AI") : active.name.split(" ")[0]} · {ago(m.at)}
                      </div>
                      <div
                        className={cn(
                          "max-w-[78%] whitespace-pre-line rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed",
                          !mine && "rounded-tl-md bg-panel-2 text-text",
                          mine && !owner && "rounded-tr-md bg-accent-soft text-text",
                          mine && owner && "rounded-tr-md bg-accent text-white",
                        )}
                      >
                        {m.content}
                      </div>
                      {notes[m.id] && (
                        <div className="mt-1 flex items-center gap-1 px-1 text-[13px] text-text-faint">
                          <Check className="h-3.5 w-3.5" /> {notes[m.id]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <footer className="border-t border-border p-4">
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {QUICK.map((qr) => (
                    <button key={qr} onClick={() => setText(qr)} className="rounded-full bg-panel-2 px-3 py-1.5 text-[13.5px] text-text-dim hover:text-text">
                      {qr}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(text);
                  }}
                  className="flex items-end gap-2.5"
                >
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send(text);
                      }
                    }}
                    rows={2}
                    placeholder={`Reply to ${active.name.split(" ")[0]}…`}
                    className="min-h-[52px] flex-1 resize-none rounded-[20px] border border-border bg-panel px-4 py-3 text-[15px] outline-none focus:border-accent"
                  />
                  <button type="submit" disabled={!text.trim() || sending} className="btn-primary flex h-[52px] items-center gap-2 disabled:opacity-50">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                  </button>
                </form>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
