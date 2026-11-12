import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, type WhatsAppSendResult } from "@/lib/whatsapp";
import { templateSid, type WaTemplateKind } from "@/lib/whatsapp-templates";
import { briefingTemplateVars, formatBriefingMessage, ownerNumberKey, withinReplyWindow } from "@/lib/whatsapp-boss";
import type { BriefingTask, Lang } from "@/lib/daily-briefing";

/**
 * Sends the daily store check to the owner's own WhatsApp number — only when they turned
 * "Orbit on WhatsApp" on. It goes out from the store's own WhatsApp number when one is assigned
 * (otherwise the Orbit sender), and the owner replies to that same number.
 *
 * WhatsApp's 24-hour rule: if the owner wrote to Orbit in the last 24 hours the full message goes
 * as normal text; otherwise only the Meta-approved `daily_briefing` template can be delivered, so
 * without a saved template nothing is sent and the reason is returned (never a silent failure).
 */
export async function sendBriefingWhatsApp(businessId: string, tasks: BriefingTask[], lang: Lang, opts: { now?: Date } = {}): Promise<WhatsAppSendResult> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, whatsapp: true, whatsappBoss: true, whatsappInboundNumber: true, whatsappBossInboundAt: true },
  });
  if (!b) return { sent: false, error: "Store not found." };
  if (!b.whatsappBoss) return { sent: false, error: "Orbit on WhatsApp is turned off for this store." };
  const to = ownerNumberKey(b.whatsapp);
  if (!to) return { sent: false, error: "The owner WhatsApp number on file isn't a complete number (use 03xx xxxxxxx or +92…)." };
  const from = b.whatsappInboundNumber || undefined;
  const text = formatBriefingMessage(tasks, lang, b.name);

  if (withinReplyWindow(b.whatsappBossInboundAt, opts.now)) return sendWhatsAppMessage(to, text, { from });

  const kind: WaTemplateKind = lang === "ur" && templateSid("daily_briefing_ur") ? "daily_briefing_ur" : "daily_briefing";
  if (!templateSid(kind))
    return {
      sent: false,
      error:
        "WhatsApp only lets Orbit message you first with an approved template, and the daily store check template isn't set up yet (Super Admin > WhatsApp). Until then: send any message (for example START) from your WhatsApp to the store's WhatsApp number, and Orbit can reply for the next 24 hours.",
    };
  return sendWhatsAppMessage(to, text, { from, template: { kind, vars: briefingTemplateVars(tasks, lang, b.name) } });
}
