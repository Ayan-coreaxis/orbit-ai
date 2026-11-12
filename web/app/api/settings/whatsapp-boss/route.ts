import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { ownerLang, parseBriefingTasks, runDailyBriefing } from "@/lib/daily-briefing";
import { sendBriefingWhatsApp } from "@/lib/whatsapp-boss-send";
import { ownerNumberKey } from "@/lib/whatsapp-boss";

export const maxDuration = 60;

/** Turn "Orbit on WhatsApp" on or off for the store's owner number. */
export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false." }, { status: 400 });
  if (enabled) {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { whatsapp: true } });
    if (!ownerNumberKey(b?.whatsapp))
      return NextResponse.json({ error: "Your WhatsApp number on file isn't a complete number (use 03xx xxxxxxx or +92…). Ask the Orbit team to correct it first." }, { status: 400 });
  }
  await prisma.business.update({ where: { id: businessId }, data: { whatsappBoss: enabled, ...(enabled ? {} : { whatsappBossProposalId: null }) } });
  return NextResponse.json({ enabled });
}

/** "Send me a test briefing" — today's store check (run now if there isn't one yet) to the owner's WhatsApp. */
export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { whatsappBoss: true } });
  if (!b?.whatsappBoss) return NextResponse.json({ error: "Turn on Orbit on WhatsApp first." }, { status: 400 });

  const dayAgo = new Date(Date.now() - 24 * 3_600_000);
  let briefing = await prisma.orchestratorMessage.findFirst({
    where: { businessId, speaker: "briefing", createdAt: { gte: dayAgo } },
    orderBy: { createdAt: "desc" },
    select: { tasks: true },
  });
  if (!briefing) {
    // No store check today yet — run it now (it also shows in the Orchestrator chat). The send below is the only WhatsApp.
    await runDailyBriefing(businessId, { force: true, whatsapp: false });
    briefing = await prisma.orchestratorMessage.findFirst({
      where: { businessId, speaker: "briefing", createdAt: { gte: dayAgo } },
      orderBy: { createdAt: "desc" },
      select: { tasks: true },
    });
  }
  const r = await sendBriefingWhatsApp(businessId, parseBriefingTasks(briefing?.tasks), await ownerLang(businessId));
  if (!r.sent) return NextResponse.json({ error: r.error ?? "Couldn't send the WhatsApp message." }, { status: 502 });
  return NextResponse.json({ sent: true });
}
