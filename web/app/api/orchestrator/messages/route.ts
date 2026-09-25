import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { parseSummary } from "@/lib/strategy-chat";
import { attachmentViews } from "@/lib/media";

/** Orchestrator chat history. `?after=<ISO time>` returns only newer messages (the chat polls this
 * so things Orbit posts on its own — work summaries, scheduled reviews — show up without a reload). */
export async function GET(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ messages: [] });
  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  const messages = await prisma.orchestratorMessage.findMany({
    where: { businessId, ...(afterDate && !isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}) },
    orderBy: { createdAt: "asc" },
    take: afterDate ? 50 : 500,
  });
  const files = await attachmentViews(businessId, messages);
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      speaker: m.speaker,
      needsUser: m.needsUser,
      opsState: m.opsState,
      opsSummary: parseSummary(m.opsSummary),
      askApproval: m.askApproval,
      attachments: files.get(m.id) ?? [],
      createdAt: m.createdAt,
    })),
  });
}
