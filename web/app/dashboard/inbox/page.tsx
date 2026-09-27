import { Topbar } from "@/components/Topbar";
import { Card, Pill } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { MessageCircle } from "lucide-react";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/icons/BrandIcons";

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "whatsapp") return <WhatsAppIcon size={18} />;
  if (channel === "instagram") return <InstagramIcon size={18} />;
  if (channel === "messenger") return <FacebookIcon size={18} />;
  return <MessageCircle className="h-[18px] w-[18px] text-text-faint" />;
}

function who(channel: string, ref: string): string {
  if (channel === "whatsapp") return ref;
  if (channel === "instagram") return `Instagram user …${ref.slice(-6)}`;
  if (channel === "messenger") return `Messenger user …${ref.slice(-6)}`;
  return `Website visitor ${ref.slice(0, 8)}`;
}

interface ConversationGroup {
  channel: string;
  customerRef: string;
  messages: { role: string; content: string; createdAt: Date }[];
  lastAt: Date;
}

export default async function InboxPage() {
  const businessId = await getActiveBusinessId();
  const rows = businessId
    ? await prisma.chatMessage.findMany({
        where: { businessId },
        orderBy: { createdAt: "asc" },
        select: { channel: true, customerRef: true, role: true, content: true, createdAt: true },
      })
    : [];

  const groups = new Map<string, ConversationGroup>();
  for (const row of rows) {
    const key = `${row.channel}:${row.customerRef}`;
    const existing = groups.get(key);
    if (existing) {
      existing.messages.push(row);
      existing.lastAt = row.createdAt;
    } else {
      groups.set(key, { channel: row.channel, customerRef: row.customerRef, messages: [row], lastAt: row.createdAt });
    }
  }
  const conversations = Array.from(groups.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

  return (
    <div>
      <Topbar
        title="Customer Messages"
        subtitle={
          conversations.length > 0
            ? `${conversations.length} real conversation${conversations.length === 1 ? "" : "s"}`
            : "No conversations yet"
        }
      />
      <div className="max-w-[1200px] space-y-4 p-5 sm:p-8 lg:p-10">
        {conversations.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <MessageCircle className="h-6 w-6 text-text-faint" />
            <p className="max-w-md text-[13.5px] leading-relaxed text-text-faint">
              No real customer conversations yet. Your website chat widget, WhatsApp (once a number
              is assigned) and your Facebook Page&apos;s Messenger and Instagram DMs (once Meta is
              connected) all write here — this fills in the moment a real customer asks something.
            </p>
          </Card>
        ) : (
          conversations.map((c) => {
            const lastMessage = c.messages[c.messages.length - 1];
            return (
              // <summary> must be the <details>' first child or the browser hides the whole thread
              // behind its own "Details" label — so the card styling lives on <details> itself.
              <details
                key={`${c.channel}:${c.customerRef}`}
                className="group rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(30,28,24,0.04)]"
              >
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
                    <ChannelIcon channel={c.channel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium">
                          {who(c.channel, c.customerRef)}
                        </span>
                        <Pill tone={c.channel === "website" ? "neutral" : "good"}>{c.channel}</Pill>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-text-faint">
                        {lastMessage.role === "user" ? "" : "Assistant: "}
                        {lastMessage.content}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11.5px] text-text-faint">
                      {c.lastAt.toLocaleDateString()} {c.lastAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </summary>
                  <div className="space-y-2.5 border-t border-border p-5">
                    {c.messages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[75%] whitespace-pre-line rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${
                            m.role === "user" ? "bg-panel-2 text-text-dim" : "bg-accent-soft text-accent-strong"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
