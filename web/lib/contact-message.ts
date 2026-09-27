import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifySeller } from "@/lib/notify";
import { bestEffort } from "@/lib/log";

/**
 * A shopper wrote in through the store's contact form: save it (Inbox + Store > Messages) and ping
 * the seller the same way a new order does, so a question doesn't sit unseen for days.
 */
export async function saveContactMessage(businessId: string, m: { name: string; email: string; message: string }) {
  await prisma.contactMessage.create({
    data: { businessId, name: m.name.slice(0, 120), email: m.email.slice(0, 160), message: m.message.slice(0, 4000) },
  });
  after(() =>
    bestEffort("contact.notifySeller", async () => {
      const b = await prisma.business.findUnique({
        where: { id: businessId },
        select: { notifyNewOrders: true, whatsapp: true, owner: { select: { email: true } } },
      });
      if (!b?.notifyNewOrders) return;
      await notifySeller(
        { phone: b.whatsapp, email: b.owner?.email },
        `New message from ${m.name}`,
        `${m.message.slice(0, 600)}${m.email ? `\nReply to: ${m.email}` : ""}\n(Also in your Orbit Inbox.)`,
      );
    }),
  );
}
