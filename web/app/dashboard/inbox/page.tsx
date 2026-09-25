import { Topbar } from "@/components/Topbar";
import { Card, Pill } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { MessageCircle } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/BrandIcons";

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
            : "No real conversations yet"
        }
      />
      <div className="max-w-[1200px] space-y-4 p-10">
        {conversations.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <MessageCircle className="h-6 w-6 text-text-faint" />
            <p className="max-w-md text-[13.5px] leading-relaxed text-text-faint">
              No real customer conversations yet. Your website chat widget and (once a real number
              is assigned) WhatsApp chatbot both write here — this fills in the moment a real
              customer asks something.
            </p>
          </Card>
        ) : (
          conversations.map((c) => {
            const lastMessage = c.messages[c.messages.length - 1];
            return (
              <details key={`${c.channel}:${c.customerRef}`} className="group">
                <Card className="p-0">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
                    {c.channel === "whatsapp" ? <WhatsAppIcon size={18} /> : <MessageCircle className="h-[18px] w-[18px] text-text-faint" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium">
                          {c.channel === "whatsapp" ? c.customerRef : `Website visitor ${c.customerRef.slice(0, 8)}`}
                        </span>
                        <Pill tone={c.channel === "whatsapp" ? "good" : "neutral"}>{c.channel}</Pill>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-text-faint">
                        {lastMessage.role === "user" ? "" : "You: "}
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
                          className={`max-w-[75%] rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${
                            m.role === "user" ? "bg-panel-2 text-text-dim" : "bg-accent-soft text-accent-strong"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
