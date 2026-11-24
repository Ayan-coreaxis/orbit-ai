import { Topbar } from "@/components/Topbar";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { Mail, MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card } from "@/components/ui";
import { InboxClient, type InboxConversation } from "@/components/inbox/InboxClient";
import { DemoStart } from "@/components/inbox/DemoStart";
import { demoName, isDemoRef } from "@/lib/inbox";

export const metadata = { title: "Inbox" };

const digits = (s: string) => s.replace(/\D/g, "");

export default async function InboxPage() {
  const businessId = await getActiveBusinessId();
  const [rows, business, orders, contactMessages] = businessId
    ? await Promise.all([
        prisma.chatMessage.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, select: { id: true, channel: true, customerRef: true, role: true, sender: true, content: true, createdAt: true } }),
        prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }),
        prisma.order.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, customerName: true, customerPhone: true, total: true, status: true, createdAt: true } }),
        prisma.contactMessage.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 30 }),
      ])
    : [[], null, [], []];
  const cur = business?.storeCurrency ?? "pkr";

  const groups = new Map<string, InboxConversation>();
  for (const r of rows) {
    const key = `${r.channel}:${r.customerRef}`;
    let g = groups.get(key);
    if (!g) {
      // A WhatsApp customer who has ordered is shown by the name on their order.
      const d = r.channel === "whatsapp" ? digits(r.customerRef).slice(-9) : "";
      const mine = d.length >= 9 ? orders.filter((o) => digits(o.customerPhone).endsWith(d)) : [];
      const name = isDemoRef(r.customerRef)
        ? demoName(r.customerRef)
        : (mine[0]?.customerName ??
          (r.channel === "whatsapp" ? r.customerRef.replace(/^whatsapp:/, "") : r.channel === "instagram" ? `Instagram …${r.customerRef.slice(-6)}` : r.channel === "messenger" ? `Messenger …${r.customerRef.slice(-6)}` : `Website visitor ${r.customerRef.slice(0, 6)}`));
      g = {
        key,
        channel: r.channel,
        customerRef: r.customerRef,
        name,
        demo: isDemoRef(r.customerRef),
        messages: [],
        lastAt: r.createdAt.toISOString(),
        orders: mine.slice(0, 3).map((o) => ({ id: o.id, totalLabel: money(o.total, cur), status: o.status, at: o.createdAt.toISOString() })),
      };
      groups.set(key, g);
    }
    g.messages.push({
      id: r.id,
      role: r.role === "user" ? "user" : "assistant",
      sender: r.role === "user" ? null : r.sender === "owner" ? "owner" : "bot",
      content: r.content,
      at: r.createdAt.toISOString(),
    });
    g.lastAt = r.createdAt.toISOString();
  }
  const conversations = [...groups.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const hasDemo = conversations.some((c) => c.demo);
  const total = conversations.length + contactMessages.length;
  const waiting = conversations.filter((c) => c.messages[c.messages.length - 1]?.role === "user").length;

  return (
    <div>
      <Topbar
        title="Inbox"
        subtitle={
          total > 0
            ? [conversations.length ? `${conversations.length} chat${conversations.length === 1 ? "" : "s"}` : "", waiting ? `${waiting} waiting for you` : "all answered", contactMessages.length ? `${contactMessages.length} from the contact form` : ""]
                .filter(Boolean)
                .join(" · ")
            : "Every customer message, in one place"
        }
      />
      <div className="page-body space-y-5">
        {conversations.length === 0 && contactMessages.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              body="Chats from your website, WhatsApp, Messenger and Instagram all land here — and you can answer them without leaving Orbit."
              action={{ label: "Connect WhatsApp & Instagram", href: "/dashboard/settings/channels" }}
            />
            <div className="flex justify-center">
              <DemoStart />
            </div>
          </div>
        ) : (
          <>
            {conversations.length > 0 ? (
              <InboxClient initial={conversations} hasDemo={hasDemo} />
            ) : null}
            {contactMessages.length > 0 && (
              <Card className="p-0">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4 text-[15px] font-semibold">
                  <Mail className="h-4 w-4 text-text-faint" /> From your store&apos;s contact form
                </div>
                <div className="divide-y divide-border">
                  {contactMessages.map((m) => (
                    <div key={m.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-x-2 text-[14.5px]">
                        <span className="font-medium">{m.name}</span>
                        {m.email && (
                          <a href={`mailto:${m.email}`} className="text-accent underline-offset-2 hover:underline">
                            {m.email}
                          </a>
                        )}
                        <span className="ml-auto text-[13px] text-text-faint">
                          {m.createdAt.toLocaleDateString()} {m.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed text-text-dim">{m.message}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {!hasDemo && conversations.length > 0 && <DemoStart subtle />}
          </>
        )}
      </div>
    </div>
  );
}
