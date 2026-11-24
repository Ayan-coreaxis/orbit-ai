import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { DEMO_PREFIX, demoConversations } from "@/lib/inbox";

/** Add the sample conversations (idempotent) so the Inbox can be tried before any channel is connected. */
export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const exists = await prisma.chatMessage.count({ where: { businessId, customerRef: { startsWith: DEMO_PREFIX } } });
  if (exists) return NextResponse.json({ ok: true, added: 0 });
  const products = await prisma.product.findMany({ where: { businessId }, select: { name: true }, take: 3, orderBy: { createdAt: "desc" } });
  const now = Date.now();
  const rows = demoConversations(products.map((p) => p.name)).flatMap((c) =>
    c.messages.map((m) => ({
      businessId,
      channel: c.channel,
      customerRef: c.ref,
      role: m.role,
      sender: m.sender ?? null,
      content: m.content,
      createdAt: new Date(now - m.ago * 60_000),
    })),
  );
  await prisma.chatMessage.createMany({ data: rows });
  return NextResponse.json({ ok: true, added: rows.length });
}

/** Remove every demo conversation. */
export async function DELETE() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const r = await prisma.chatMessage.deleteMany({ where: { businessId, customerRef: { startsWith: DEMO_PREFIX } } });
  return NextResponse.json({ ok: true, removed: r.count });
}
