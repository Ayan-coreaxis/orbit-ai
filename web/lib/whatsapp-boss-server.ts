import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeActivePlan } from "@/lib/harness";
import { appBaseUrl } from "@/lib/public-url";
import { sendWhatsAppMessage, whatsAppNumberKey } from "@/lib/whatsapp";
import { ownerLang, parseBriefingTasks, setTaskState, type Lang } from "@/lib/daily-briefing";
import { OrchestratorTurnError, runOrchestratorTurn } from "@/lib/orchestrator-turn";
import { parseSummary, resolveProposal } from "@/lib/strategy-chat";
import { clampForWhatsApp, formatApplied, formatOwnerReply, isOwnerNumber, noSuchTaskText, ownerText, parseOwnerCommand, REPLY_WINDOW_MS, type OwnerCommand } from "@/lib/whatsapp-boss";

/**
 * "Orbit on WhatsApp" — the owner's side of the Twilio webhook. A message from the store OWNER's
 * own number is handled here instead of by the shopper chatbot:
 *   1, 2…      → that task from today's store check: marked done and sent to the Orchestrator
 *                exactly like the dashboard's Prepare (the turn and any proposal are saved in the chat)
 *   APPLY / NO → apply or drop the ONE proposal last shown to the owner on WhatsApp (pending, < 24h)
 *   STOP/START → turn Orbit on WhatsApp off / on
 *   anything else → a normal Orchestrator chat message
 * Nothing changes the store without the owner's APPLY to a proposal they were shown in full.
 */

export interface OwnerBusiness {
  id: string;
  whatsapp: string | null;
  whatsappBoss: boolean;
  whatsappBossProposalId: string | null;
}

const OWNER_SELECT = { id: true, whatsapp: true, whatsappBoss: true, whatsappBossProposalId: true } as const;

const dashboardUrl = () => `${appBaseUrl()}/dashboard/orchestrator`;

/** Does the owner handler take this message? Opted-out owners only get through with START. */
function takes(b: OwnerBusiness, from: string, cmd: OwnerCommand): boolean {
  return isOwnerNumber(from, b.whatsapp) && (b.whatsappBoss || cmd.type === "start");
}

/**
 * Which store (if any) is this sender the owner of, for a message sent to `to`?
 * - `to` is a store's own WhatsApp number → only that store, and only when the sender is exactly
 *   its owner number. Everyone else is a shopper.
 * - `to` is the Orbit sender (the daily check goes out from it when a store has no number of its
 *   own) → the store whose owner number matches; if that isn't exactly one store, nobody.
 */
export async function resolveOwner(
  storeForNumber: OwnerBusiness | null,
  from: string,
  to: string,
  body: string,
): Promise<{ business: OwnerBusiness | null; ambiguous: boolean }> {
  const cmd = parseOwnerCommand(body);
  if (storeForNumber) return { business: takes(storeForNumber, from, cmd) ? storeForNumber : null, ambiguous: false };
  const platform = process.env.TWILIO_WHATSAPP_FROM ? whatsAppNumberKey(process.env.TWILIO_WHATSAPP_FROM) : "";
  if (!platform || whatsAppNumberKey(to) !== platform) return { business: null, ambiguous: false };
  const all = await prisma.business.findMany({ where: { whatsapp: { not: null } }, select: OWNER_SELECT });
  const mine = all.filter((b) => isOwnerNumber(from, b.whatsapp));
  const on = mine.filter((b) => b.whatsappBoss);
  if (on.length === 1) return { business: on[0], ambiguous: false };
  if (on.length > 1) return { business: null, ambiguous: true };
  if (cmd.type === "start" && mine.length === 1) return { business: mine[0], ambiguous: false };
  return { business: null, ambiguous: cmd.type === "start" && mine.length > 1 };
}

export { OWNER_SELECT };

/** Handle one message from the owner and answer on WhatsApp (from the number they wrote to). */
export async function handleOwnerMessage(business: OwnerBusiness, body: string, from: string, to: string): Promise<void> {
  const businessId = business.id;
  const now = new Date();
  const lang: Lang = await ownerLang(businessId).catch(() => "en" as const);
  const say = (text: string) => sendWhatsAppMessage(from, clampForWhatsApp(text, lang, dashboardUrl()), { from: to });
  const cmd = parseOwnerCommand(body);

  // The owner just wrote to us — free-form replies can reach them for the next 24 hours.
  await prisma.business.update({ where: { id: businessId }, data: { whatsappBossInboundAt: now } });

  try {
    if (cmd.type === "stop") {
      await prisma.business.update({ where: { id: businessId }, data: { whatsappBoss: false, whatsappBossProposalId: null } });
      await say(ownerText("stopped", lang));
      return;
    }
    if (cmd.type === "start") {
      await prisma.business.update({ where: { id: businessId }, data: { whatsappBoss: true } });
      await say(ownerText("started", lang));
      return;
    }

    if (cmd.type === "apply" || cmd.type === "dismiss") {
      // Only the proposal this owner was shown on WhatsApp, still pending, from the last 24 hours.
      const proposal = business.whatsappBossProposalId
        ? await prisma.orchestratorMessage.findFirst({
            where: { id: business.whatsappBossProposalId, businessId, opsState: "pending", createdAt: { gte: new Date(now.getTime() - REPLY_WINDOW_MS) } },
            select: { id: true },
          })
        : null;
      if (proposal) {
        await prisma.business.update({ where: { id: businessId }, data: { whatsappBossProposalId: null } });
        if (cmd.type === "dismiss") {
          await resolveProposal(businessId, proposal.id, "dismiss");
          await say(ownerText("dismissed", lang));
          return;
        }
        // Same path as the dashboard's Apply button.
        const applied = await resolveProposal(businessId, proposal.id, "apply");
        after(() => executeActivePlan(businessId));
        await say(formatApplied(applied, lang, dashboardUrl()));
        return;
      }
      if (cmd.type === "apply" && cmd.explicit) {
        await say(ownerText("nothing_pending", lang));
        return;
      }
      // A bare "yes" / "no" with nothing waiting is just part of the conversation.
      await chatTurn(businessId, body, lang, say);
      return;
    }

    if (cmd.type === "task") {
      const briefing = await prisma.orchestratorMessage.findFirst({
        where: { businessId, speaker: "briefing", createdAt: { gte: new Date(now.getTime() - 36 * 3_600_000) } },
        orderBy: { createdAt: "desc" },
        select: { id: true, tasks: true },
      });
      const tasks = parseBriefingTasks(briefing?.tasks);
      if (!briefing || !tasks.length) {
        await say(ownerText("no_briefing", lang));
        return;
      }
      const task = tasks[cmd.n - 1];
      if (!task) {
        await say(noSuchTaskText(cmd.n, tasks.length, lang));
        return;
      }
      await say(ownerText("working", lang));
      await setTaskState(businessId, briefing.id, task.id, "done");
      await chatTurn(businessId, task.prompt, lang, say);
      return;
    }

    await chatTurn(businessId, body, lang, say);
  } catch (e) {
    console.warn("[whatsapp-boss]", businessId, e);
    await say(e instanceof Error && e.message ? e.message : lang === "ur" ? "Kuch ghalat ho gaya — dashboard mein dekhein." : "Something went wrong — please check the dashboard.").catch(() => {});
  }
}

/** One Orchestrator chat turn (saved in the chat like any other), answered on WhatsApp. */
async function chatTurn(businessId: string, message: string, lang: Lang, say: (text: string) => Promise<unknown>): Promise<void> {
  let turn: Awaited<ReturnType<typeof runOrchestratorTurn>>;
  try {
    turn = await runOrchestratorTurn(businessId, { message });
  } catch (e) {
    if (e instanceof OrchestratorTurnError) {
      await say(e.message);
      return;
    }
    throw e;
  }
  // A turn makes at most one pending proposal. Read its summary back from the saved message so
  // what the owner sees is exactly what APPLY will act on.
  const pendingId = [...turn.messages].reverse().find((m) => m.opsState === "pending")?.id ?? null;
  const saved = pendingId ? await prisma.orchestratorMessage.findFirst({ where: { id: pendingId, businessId, opsState: "pending" }, select: { id: true, opsSummary: true } }) : null;
  const summary = saved ? parseSummary(saved.opsSummary) : null;
  const out = formatOwnerReply(turn.reply, { lang, dashboardUrl: dashboardUrl(), proposal: summary });
  // APPLY is only armed for a proposal that was shown in full, and only once the message went out.
  const sent = (await say(out.text)) as { sent?: boolean } | undefined;
  if (saved)
    await prisma.business.update({
      where: { id: businessId },
      data: { whatsappBossProposalId: out.offersApply && sent?.sent ? saved.id : null },
    });
}
